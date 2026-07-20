import os
import requests
import cloudinary
import cloudinary.api
import boto3
from dotenv import load_dotenv

# Load credentials from .env
load_dotenv()

# Configure Cloudinary
cloudinary.config(
    cloud_name=os.getenv('CLOUDINARY_CLOUD_NAME', 'ggdlbhrf'),
    api_key=os.getenv('CLOUDINARY_API_KEY', '154731121199677'),
    api_secret=os.getenv('CLOUDINARY_API_SECRET', 'dquFbWva1EO_bTI__FbKiCieRrs')
)

os.makedirs("./downloaded_resumes", exist_ok=True)

# Fetch all uploaded raw resources (PDF/Docx) with pagination support
print("1. Fetching all files from Cloudinary...")
files_downloaded = []
next_cursor = None
page = 1

while True:
    print(f"Fetching page {page} from Cloudinary...")
    if next_cursor:
        resources = cloudinary.api.resources(resource_type="raw", max_results=500, next_cursor=next_cursor)
    else:
        resources = cloudinary.api.resources(resource_type="raw", max_results=500)
    
    current_batch = resources.get('resources', [])
    print(f"Found {len(current_batch)} files in this batch.")
    
    for res in current_batch:
        url = res['secure_url']
        filename = os.path.basename(res['public_id'])
        
        if not os.path.splitext(filename)[1]:
            ext = os.path.splitext(url)[1]
            filename += ext
            
        dest_path = f"./downloaded_resumes/{filename}"
        files_downloaded.append(dest_path)
        
        # Skip download if file already exists locally
        if os.path.exists(dest_path):
            continue
            
        print(f"Downloading: {filename}")
        try:
            response = requests.get(url)
            with open(dest_path, "wb") as f:
                f.write(response.content)
        except Exception as e:
            print(f"Failed to download {filename}: {e}")

    next_cursor = resources.get('next_cursor')
    if not next_cursor:
        break
    page += 1

print("\n2. Download completed successfully!")

aws_key = os.getenv('AWS_ACCESS_KEY_ID')
aws_secret = os.getenv('AWS_SECRET_ACCESS_KEY')
aws_region = os.getenv('AWS_S3_REGION_NAME', 'ap-south-1')
bucket_name = os.getenv('AWS_STORAGE_BUCKET_NAME', 'ats-resumestorage')

if not aws_key or not aws_secret:
    print("\nError: AWS Credentials missing from environment.")
    exit(1)

s3 = boto3.client(
    's3',
    aws_access_key_id=aws_key,
    aws_secret_access_key=aws_secret,
    region_name=aws_region
)

# Fetch list of files already in S3 to avoid duplicate uploads
print("\nFetching existing files in S3 bucket...")
s3_resource = boto3.resource(
    's3',
    aws_access_key_id=aws_key,
    aws_secret_access_key=aws_secret,
    region_name=aws_region
)
bucket = s3_resource.Bucket(bucket_name)
try:
    s3_files = {obj.key for obj in bucket.objects.all()}
    print(f"Found {len(s3_files)} files already in S3.")
except Exception as e:
    print("Could not query S3 bucket files, starting fresh upload...")
    s3_files = set()

print("\n4. Uploading files to S3...")
upload_count = 0
for file_path in files_downloaded:
    filename = os.path.basename(file_path)
    if filename in s3_files:
        continue
        
    print(f"Uploading: {filename}...")
    try:
        s3.upload_file(
            file_path,
            bucket_name,
            filename,
            ExtraArgs={'ContentType': 'application/pdf', 'ContentDisposition': 'inline'}
        )
        upload_count += 1
    except Exception as e:
        print(f"Failed to upload {filename}: {e}")

print(f"\nMigration completed successfully! Uploaded {upload_count} new files.")
