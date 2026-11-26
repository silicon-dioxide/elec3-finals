# Museum audio guide ratings

This repository contains a visitor page, a curator summary page, and one ratings API backed by a local DynamoDB-compatible simulator.

## Install

Node.js 20 or newer is required. Install the backend packages once:

```powershell
cd backend
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
npm install --save-dev dynalite aws-sdk-client-mock vitest
```

Install the curator app packages once:

```powershell
cd ../frontend/curator
npm install
```

The visitor Vite app was scaffolded separately and already has its dependencies installed.

## Run locally

Start the in-memory database and API in one terminal:

```powershell
cd backend
npm run dev
```

Start each front end in its own terminal:

```powershell
cd frontend/visitor
npm run dev
```

```powershell
cd frontend/curator
npm run dev
```

Open `http://localhost:5173/?id=07` for the visitor page and `http://localhost:5174/` for the curator page. Local Vite proxies `/api` to the API on port 3001.

## Test and verify

Run the backend unit and integration tests:

```powershell
cd backend
npm test
```

With the API running, submit a rating and read the summary:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3001/ratings -ContentType 'application/json' -Body '{"exhibitId":"07","rating":5}'
Invoke-RestMethod -Uri http://localhost:3001/exhibits/07/ratings
```

Repeat with ratings 4 and 3 for exhibit `07`; its summary should be count `3`, average `4`. Rate exhibit `08` and confirm its summary stays separate. The curator page should show those summaries, while the visitor page should submit ratings and show the API response.

Build both static front ends with `npm run build` from their respective folders.

## Deployment notes

Set `VITE_API_BASE` to the real API Gateway URL **before** each production build. The local `/api` Vite proxy is not available from S3 or EC2. Set `VITE_VISITOR_URL` before building the curator page so its links point to the deployed visitor site.

The Lambda execution role needs `dynamodb:PutItem` and `dynamodb:Query` on the `Ratings` table, plus the usual CloudWatch logging permissions. Configure CORS on API Gateway; the Lambda handler intentionally adds no CORS headers. Create the on-demand `Ratings` table with string partition key `exhibitId` and string sort key `ratingId` before deploying.
