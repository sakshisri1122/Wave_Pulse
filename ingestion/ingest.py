import os
import json
import re
import time
from datetime import datetime
from pathlib import Path
import argparse
import psycopg2
from psycopg2 import extras
from loguru import logger

DEFAULT_CHECKPOINT = "checkpoint.txt"
DEFAULT_BATCH_SIZE = 1000
MAX_RETRIES = 4
RETRY_DELAY = 2

def get_connection():
    """Establish and return a PostgreSQL database connection."""
    return psycopg2.connect(
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT"),
        sslmode=os.getenv("SSL_MODE")
    )

def normalize_speaker(speaker):
    """Normalize the speaker field or return 'Unknown'."""
    return speaker.strip() if speaker else 'Unknown'

def text_cleaning(text):
    """Clean extra whitespace from transcript text."""
    return re.sub(r'\s+', ' ', text.strip()) if text else None

def validate_segment(segment):
    """Check if a transcript segment contains required keys."""
    required = ['start', 'end', 'text']
    return all(k in segment for k in required)

def extract_metadata(filename):
    """Extract state, station, and datetime from filename."""
    pattern = r'^([A-Z]{2})_([A-Z0-9]+)_(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})\.json$'
    match = re.match(pattern, filename)
    if not match:
        raise ValueError(f"Invalid filename format: {filename}")
    state, station, y, m, d, H, M = match.groups()
    dt = datetime(int(y), int(m), int(d), int(H), int(M))
    return state, station, dt

def load_checkpoint(path):
    """Load checkpoint file to skip already-ingested files."""
    if os.path.exists(path):
        with open(path, 'r') as f:
            return set(f.read().splitlines())
    return set()

def save_checkpoint(path, filename):
    """Append processed file name to the checkpoint file."""
    with open(path, 'a') as f:
        logger.info(f"Writing to: {os.path.abspath(path)}")
        f.write(filename + '\n')

def process_file(filepath, conn, batch_size):
    """Process one JSON transcript file and insert its segments into the database."""
    logger.info(f"Processing file: {filepath.name}")
    try:
        state, station, dt = extract_metadata(filepath.name)
    except ValueError as e:
        logger.error(str(e))
        return False

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        logger.error(f"Failed to parse {filepath.name}: {e}")
        return False

    segments = data if isinstance(data, list) else data.get('segments', [])
    rows = []
    for segment in segments:
        if not validate_segment(segment):
            continue
        rows.append((
            station,
            state,
            dt,
            normalize_speaker(segment.get('speaker')),
            float(segment['start']),
            float(segment['end']),
            text_cleaning(segment['text'])
        ))

    if not rows:
        return False

    for i in range(0, len(rows), batch_size):
        chunk = rows[i:i + batch_size]
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                with conn.cursor() as cur:
                    extras.execute_values(
                        cur,
                        """
                        INSERT INTO transcripts (
                            station, state, dt, speaker, start, "end", text
                        ) VALUES %s
                        """,
                        chunk
                    )
                conn.commit()
                break
            except Exception as e:
                conn.rollback()
                logger.error(f"Retry {attempt} failed for {filepath.name}: {e}")
                time.sleep(RETRY_DELAY)
                if attempt == MAX_RETRIES:
                    return False

    logger.success(f"Inserted {len(rows)} rows from {filepath.name}")
    return True

def main():
    """Main entry point to handle CLI options and start the ingestion process."""
    parser = argparse.ArgumentParser(description="Transcript ingestion script")
    parser.add_argument('--samples-dir', type=str, default='sample_json', help='Path to your JSON files')
    parser.add_argument('--checkpoint-file', type=str, default=DEFAULT_CHECKPOINT, help='Checkpoint filename')
    parser.add_argument('--batch-size', type=int, default=DEFAULT_BATCH_SIZE, help='Batch size for inserts')
    args = parser.parse_args()

    try:
        conn = get_connection()
    except Exception as e:
        logger.critical(f"Database connection failed: {e}")
        return

    processed_files = load_checkpoint(args.checkpoint_file)

    logger.info(f"Sample dir resolved to: {args.samples_dir}")
    logger.info(f"Files found: {[f.name for f in Path(args.samples_dir).glob('*.json')]}")
    logger.info(f"Already processed: {list(processed_files)}")

    all_files = sorted([f for f in Path(args.samples_dir).glob('*.json') if f.name not in processed_files])
    logger.info(f"Starting ingestion for {len(all_files)} new file(s)")

    for filepath in all_files:
        if process_file(filepath, conn, args.batch_size):
            save_checkpoint(args.checkpoint_file, filepath.name)

    conn.close()
    logger.success("Ingestion complete.")

if __name__ == '__main__':
    main()
