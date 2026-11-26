# Museum Audio Guide Ratings — Handoff

## Which visitor page is active?

`frontend/visitor` is the visitor site used by the ratings system. It follows the visual direction of `visitor-page` and submits ratings to the API.

`visitor-page` is still present as a separate, earlier standalone app. The ratings backend and S3 build do not use it. Its design decisions and exhibit 01 text have been carried into `frontend/visitor`; keep the old app until the remaining exhibit data and any desired audio files have been migrated.

## Project map

- `backend/src/handler.js` — Lambda handler for `POST /ratings` and `GET /exhibits/{id}/ratings`.
- `backend/local/db.js` — in-memory Dynalite database on port 8000; exports `start()` and `stop()`.
- `backend/local/server.js` — local HTTP adapter on port 3001 that invokes the same handler and adds local CORS for ports 5173 and 5174.
- `backend/test/` — Vitest handler tests and Dynalite integration tests.
- `frontend/visitor/` — S3-ready React app on Vite port 5173. It reads `?id=`; `?id=1` and `?id=01` both resolve to exhibit `01`. IDs are normalized to the API's required zero-padded format `01` through `25`.
- `frontend/visitor/src/data/audio-guides.json` — visitor page content indexed by zero-padded exhibit ID. Each entry contains `title`, `artist`, `description`, and `filename`; the page title, description, and audio source follow the selected ID.
- `frontend/curator/` — curator dashboard on Vite port 5174; loads each exhibit summary independently.
Visitor audio files belong in `frontend/visitor/public/audio-guide/<id>/<filename>` (for example, `public/audio-guide/01/visitor-guide.mp3`) and should be 1 MB or smaller. The JSON filename determines the audio URL. The current sample is in `visitor-page/public/audio/visitor-guide.mp3` and is about 1.64 MB; it has not been migrated, so add a compliant audio file before expecting playback. The curator page link target is controlled by `VITE_VISITOR_URL`.

## Local run

Dependencies are currently installed in the backend and both front-end folders. From the repository root, start these in three separate terminals:

```powershell
cd backend
npm run dev
```

```powershell
cd frontend/visitor
npm run dev
```

```powershell
cd frontend/curator
npm run dev
```

Open `http://localhost:5173/?id=7` (or `?id=07`) for exhibit `07` and `http://localhost:5174/` for the curator dashboard. IDs 1–25 work with or without a leading zero; invalid or missing visitor IDs display only “Exhibit not found.”

## Test and verify

Tests and production builds have not been run for this implementation. Run the backend unit and integration tests with:

```powershell
cd backend
npm test
```

With the local API running, submit three ratings for `07` (5, 4, and 3), then request its summary. Expected result: count `3`, average `4`. Submit a rating for `08` and confirm it has a separate summary. The visitor page should show the submission confirmation, and the curator dashboard should show updated counts and averages.

PowerShell API smoke check:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3001/ratings -ContentType 'application/json' -Body '{"exhibitId":"07","rating":5}'
Invoke-RestMethod -Uri http://localhost:3001/exhibits/07/ratings
```

Build each static site with `npm run build` from its folder. The visitor build is intended for the S3 bucket root; the curator build is intended to be served by EC2.

## Deployment reminders

- Set `VITE_API_BASE` to the deployed API Gateway base URL before building either front end. The `/api` Vite proxy is local-only.
- Set `VITE_VISITOR_URL` before building the curator site so its links open the deployed visitor page.
- Configure CORS on API Gateway; the Lambda handler intentionally adds no CORS headers.
- Create the on-demand DynamoDB table `Ratings` with string partition key `exhibitId` and string sort key `ratingId`.
- The Lambda role needs `dynamodb:PutItem` and `dynamodb:Query` on that table, plus CloudWatch logging permissions.
- Dynalite is in-memory and resets when the local server stops; it is for local simulation only.
