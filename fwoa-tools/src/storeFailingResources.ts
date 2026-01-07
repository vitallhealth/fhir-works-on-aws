import axios, { AxiosRequestConfig } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const { API_URL, API_KEY, TOKEN } = process.env;

// Output file
const OUT_FILE = 'fetched-resources.jsonl';

async function fetchResource(resourcePath: string) {
  const axiosConfig: AxiosRequestConfig = {
    headers: {
      'Content-Type': 'application/fhir+json',
      'x-api-key': API_KEY,
      Authorization: 'Bearer ' + TOKEN
    }
  };

  try {
    const response = await axios.get(API_URL + resourcePath, axiosConfig);

    return {
      resource: resourcePath,
      status: response.status,
      body: response.data
    };
  } catch (err: any) {
    return {
      resource: resourcePath,
      status: err.response?.status ?? 'ERROR',
      body: err.response?.data ?? err.message
    };
  }
}

async function main() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error('Usage: ts-node fetchResources.ts <resource-list.txt>');
    process.exit(1);
  }

  const content = fs.readFileSync(inputFile, 'utf8');
  const resources = content
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  console.log(`Loaded ${resources.length} resources from ${inputFile}`);

  // Clear output file
  fs.writeFileSync(OUT_FILE, '');

  for (const resource of resources) {
    console.log(`Fetching ${resource} ...`);

    const result = await fetchResource(resource);

    fs.appendFileSync(OUT_FILE, JSON.stringify(result) + '\n', 'utf8');
  }

  console.log(`\nDone! Wrote results to ${OUT_FILE}`);
}

main();
