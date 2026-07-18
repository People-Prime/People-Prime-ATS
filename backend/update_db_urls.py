import os
import psycopg2
from dotenv import load_dotenv

# Load database credentials from the local .env file on the server
load_dotenv()

DB_NAME = os.getenv("DB_NAME", "ats_db")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "1234")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")

s3_bucket_name = "ats-resumestorage"
s3_region = "ap-south-1"

# Construct S3 URL base
s3_base_url = f"https://{s3_bucket_name}.s3.{s3_region}.amazonaws.com/"

conn = psycopg2.connect(
    dbname=DB_NAME,
    user=DB_USER,
    password=DB_PASSWORD,
    host=DB_HOST,
    port=DB_PORT
)
cursor = conn.cursor()

# Query all application rows containing cloudinary URLs in remarks
cursor.execute("SELECT id, remarks FROM applications_application WHERE remarks LIKE '%cloudinary.com%';")
rows = cursor.fetchall()

print(f"Found {len(rows)} database records referencing Cloudinary.")

updated_count = 0
for row_id, remarks in rows:
    if not remarks:
        continue
        
    lines = remarks.split('\n')
    updated_lines = []
    has_changed = False
    
    for line in lines:
        if 'Resume Link:' in line and 'cloudinary.com' in line:
            # Extract the raw filename at the end of the URL
            parts = line.split('/')
            filename = parts[-1].strip()
            
            # Form new S3 link
            new_s3_url = s3_base_url + filename
            line = f"Resume Link: {new_s3_url}"
            has_changed = True
            
        updated_lines.append(line)
        
    if has_changed:
        new_remarks = '\n'.join(updated_lines)
        cursor.execute(
            "UPDATE applications_application SET remarks = %s WHERE id = %s;",
            (new_remarks, row_id)
        )
        updated_count += 1

conn.commit()
cursor.close()
conn.close()

print(f"Successfully updated {updated_count} application records to use AWS S3 URLs!")
