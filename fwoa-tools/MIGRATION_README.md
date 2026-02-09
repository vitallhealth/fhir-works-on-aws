## Migration

0. Follow Migration Guide steps to copy and configure export Glue job (perform this only once)
1. Set environment variables
2. Run `migrationExport.ts`
   - This starts a Glue job that exports all resources on current FWOA deployment
   - The export lands in `fhir-service-staging-bulkexportresultsbucket-1fsve5ob8p1g1` (can be found in the CloudFormation Stack resources tab.)
     - A folder with the Glue job ID is created (this should match `BULKEXPORT_ROOT_PREFIX` in .env)
     - This folder contains `Binary-v1/, v1-0/, v2-0/, etc...` as well as `migration_output.json`
       - `migration_output.json` has the `jobId` and an object called `file_names`, with the keys being `v1-0, v2-0...` and the values being an array of filenames with the format `{job-id}/v{}/{ResourceType}-{v1}-{0000X}`
3. Run `processExportedResources`
   - The script takes in the S3 bucket name and job ID, and processes each file line by line (resource by resource)
     - It does a few things in this process:
       1. Fixes resources that will fail the import (hopefully unnecessary for Prod since FHIR validation is performed)
          - Certain resources failed the initial import we performed, and the migration output showed a list of error messages for each failed resource
          - We wrote handlers for each of these errors, so this script runs each resource through these handlers to check if they need fixing
       2. Creates DocumentReference resources for each attachment found in the `extension` field of a resource.
       3. It removes that attachment from the extension field of the resource
   - The script then writes to a new folder in the same bucket called `{job-id}-processed` (`PROCESSED_BULKEXPORT_ROOT_PREFIX` env variable)
     - This new folder will follow the same structure as the original export folder, but with attachments removed from extensions
     - The created DocumentReferences are written to the file under the path `DocumentReferences-v1/DocumentReferences-v1.ndjson` in the same bucket
   - These are now ready for import into HealthLake
4. There are two options for the import:
   - Script:
     - Run `migrationImport.ts`, setting the appropriate environment variables. Note that the export bucket pointed at should be the `{job-id}-processed` folder we created.
   - Manual:
     - On the HealthLake console, start an Import.
       - Point it at the `{job-id}-processed` folder, and fill in all relevant fields
