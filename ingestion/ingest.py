import os
import json
import logging
import re
from datetime import datetime
from pathlib import Path
import time
import click
import psycopg2
from psycopg2 import extras

#File to track processed files
CHECKPOINT_FILE = "checkpoint.txt" 
#How many times to retry a failed insert
MAX_RETRIES = 4        
#Seconds to wait between retries     
RETRY_DELAY = 2              
#Number of rows to insert at once per batch
BATCH_INSERT_SIZE = 1000         

#Logging
logging.basicConfig(
    filename='ingestion.log',
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)

#Establishes and returns a connection to the PostgreSQL database
def get_connection():
    return psycopg2.connect(
        dbname='transcripts_db',
        user='sakshisrivastava', 
        password='',
        host='localhost',
        port='5432'
    )

#formats speaker name and removes extra whitespace
def normalize_speaker(speaker):
    return speaker.strip() if speaker else 'Unknown'

def text_cleaning(text):
    return re.sub(r'\s+', ' ', text.strip()) if text else None
#checks whether the JSON segment has required fields
def validate_segment(segment):
    required = ['start', 'end', 'text']
    return all(k in segment for k in required)

#extracts state, station, and datetime from filename
def extract_metadata(filename):
    pattern = r'^([A-Z]{2})_([A-Z0-9]+)_(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})\.json$'
    match = re.match(pattern, filename)
    if not match:
        raise ValueError(f"Invalid filename format: {filename}")
    state, station, y, m, d, H, M = match.groups()
    dt = datetime(int(y), int(m), int(d), int(H), int(M))
    return state, station, dt

#Loads the names of files already ingested from a checkpoint file
def load_checkpoint():
    if os.path.exists(CHECKPOINT_FILE):
        with open('checkpoint.txt', 'a') as f:
            print("✔ Writing to:", os.path.abspath('checkpoint.txt'))

            return set(f.read().splitlines())
    return set()


#Appends a file to the checkpoint log once successfully ingested
def save_checkpoint(filename):
   with open('checkpoint.txt', 'a') as f:
    print("✔ Writing to:", os.path.abspath('checkpoint.txt'))
    f.write(filename + '\n')

#parses and ingests one JSON file worth of transcript data
def process_file(filepath, conn):
    print(f"Processing file: {filepath.name}")
    try:
        state, station, dt = extract_metadata(filepath.name)
    except ValueError as e:
        logging.error(str(e))
        return False

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        logging.error(f"Failed to parse {filepath.name}: {e}")
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
            speaker_normalization(segment.get('speaker')),
            float(segment['start']),
            float(segment['end']),
            text_cleaning(segment['text'])
        ))

    if not rows:
        return False

    #Insert in chunks to avoid memory overload and transaction limits
    for i in range(0, len(rows), BATCH_INSERT_SIZE):
        chunk = rows[i:i + BATCH_INSERT_SIZE]
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
                logging.error(f"Retry {attempt} failed for {filepath.name}: {e}")
                time.sleep(RETRY_DELAY)
                if attempt == MAX_RETRIES:
                    return False

    logging.info(f"Inserted {len(rows)} rows from {filepath.name}")
    return True

#Ingestion
@click.command()
@click.option('--samples-dir', default='sample_json', help='Path to your JSON files')
def main(samples_dir):
    try:
        conn = get_connection()
    except Exception as e:
        logging.error(f"Database connection failed: {e}")
        return

    processed_files = load_checkpoint()
    all_files = sorted([f for f in Path(samples_dir).glob('*.json') if f.name not in processed_files])

    print(f"Starting ingestion for {len(all_files)} new file(s)")

    for filepath in all_files:
        if process_file(filepath, conn):
            save_checkpoint(filepath.name)

    conn.close()
    print("Ingestion is complete.")

if __name__ == '__main__':
    main()
