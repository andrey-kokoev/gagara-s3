# gagara-s3
SQL-over-S3

## What it does
gagara-s3 is a stand-alone service that allows users to run SQL queries against parquet and csv objects in any S3 storage. It supports datalake-type table catalogues. 

## API surface
### Data catalog
- `POST /catalogs` - Create a new data catalog
- `GET /catalogs/{catalogId}` - Get details of a specific data catalog
- `DELETE /catalogs/{catalogId}` - Delete a specific data catalog