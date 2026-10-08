# T24 Team Dashboard

Mobile-first race control for a five-person 24-hour triathlon relay.

The dashboard tracks the active participant, next handover, round times, phase countdowns, and the latest GPS position. Manual round and handover actions are the source of truth; GPS is an aid and can be unavailable without stopping the race log.

## Included

- Swim, bike, and run race board
- One-tap round start and finish
- Next-participant selection and handover
- Rolling handover estimate from recent rounds
- Local round history
- Swim course preview from `public/courses/swim.gpx`
- Leaflet/OpenStreetMap map
- Supabase location storage and Realtime updates when configured
- Browser geolocation fallback

## Run locally

Use Node 26 through nvm:

```bash
nvm install
nvm use
npm install
npm run dev
```

Open the local URL shown by Vite. Without Supabase environment variables, the app still runs, but data is stored only in that browser's `localStorage`.

## Free hosting: GitHub + Netlify

GitHub stores the source code and Netlify hosts the free static frontend. Supabase supplies the free backend for locations.

### 1. Push the project to GitHub

Create an empty GitHub repository, then run:

```bash
git init
git add .
git commit -m "Initial T24 dashboard"
git branch -M main
git remote add origin https://github.com/<your-user>/<your-repository>.git
git push -u origin main
```

Do not commit `.env.local`, Supabase keys, or event tokens. The `.gitignore` already excludes build output and dependencies; keep secrets in Netlify's environment-variable settings.

### 2. Create the Supabase project

1. Create a free project at <https://supabase.com/>.
2. Open **SQL Editor**.
3. Paste and run [`supabase/migrations/20261008134000_create_locations.sql`](./supabase/migrations/20261008134000_create_locations.sql).
4. Generate a long random event token. Keep it private.
5. Insert the event access row:

```sql
insert into public.event_access (event_id, access_token)
values ('your-event-id', 'PASTE_A_LONG_RANDOM_TOKEN_HERE');
```

6. In **Project Settings → API**, copy:
   - Project URL
   - Project anon/public key

The migration enables Row Level Security. Only requests carrying the matching `x-t24-event-token` can read or insert locations for that event.

### 3. Deploy the frontend to Netlify

1. Open <https://app.netlify.com/> and choose **Add new project → Import an existing project**.
2. Select GitHub and authorize the repository.
3. Use these build settings:

   | Setting | Value |
   |---|---|
   | Build command | `npm run build` |
   | Publish directory | `dist` |
   | Node version | `26` |

4. In **Site configuration → Environment variables**, add:

   ```text
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   VITE_T24_EVENT_ID=your-event-id
   VITE_T24_EVENT_TOKEN=the-same-token-used-in-event_access
   ```

5. Trigger a new deploy.

The `VITE_` values are bundled into the browser application. The anon key is designed to be public, but the event token should still be treated as private and rotated after the event. Never put a Supabase `service_role` key in Netlify frontend variables, OwnTracks, or source code.

The repository's [`netlify.toml`](./netlify.toml) tells Netlify's secret scanner to ignore the event ID and frontend event token because Vite must bundle them for this prototype. This is a deployment workaround, not strong security: anyone who can load the site can inspect those values. For a stronger setup, remove `VITE_T24_EVENT_TOKEN` from the frontend and use the protected OwnTracks/Supabase Edge Function design described below.

### 4. Test the deployment

Open the Netlify URL on two devices:

1. Open **Phone tracker** on the first device.
2. Start browser tracking and allow location access.
3. Confirm that a position appears on the second device's map.
4. Stop tracking and verify that the last location remains visible with its age.

The browser tracker requires the deployed HTTPS URL and an active page. It is a fallback, not the preferred 12-hour iPhone tracker.

## OwnTracks configuration

OwnTracks is preferable for race-day tracking because it can send background location updates while the iPhone is locked. Use one dedicated iPhone for the active participant and carry a power bank.

### Important current limitation

This repository currently includes the Supabase table and frontend receiver, but not an OwnTracks-specific Supabase Edge Function. Do **not** point OwnTracks directly at Supabase REST with a service-role key. Before the event, add or deploy a small HTTPS Edge Function that:

1. Accepts an OwnTracks HTTP location payload.
2. Authenticates a dedicated device token.
3. Validates latitude, longitude, and timestamp.
4. Inserts a row into `public.locations` using the server-side Supabase key.

The function should insert fields in this shape:

```json
{
  "event_id": "your-event-id",
  "participant_id": "p1",
  "latitude": 43.1195,
  "longitude": 6.362,
  "accuracy": 12,
  "recorded_at": "2026-10-08T13:52:00Z",
  "source": "owntracks"
}
```

Use a separate device token for this function. Do not reuse the dashboard event token unless the function is explicitly designed for that purpose.

### Configure OwnTracks on iPhone

The labels can vary slightly by OwnTracks version:

1. Install **OwnTracks** from the iPhone App Store.
2. Allow **Location: Always**.
3. Enable **Precise Location**, **Background App Refresh**, and mobile data.
4. Open OwnTracks settings and choose **HTTP** mode.
5. Set the function URL, for example:

   ```text
   https://<supabase-project-ref>.supabase.co/functions/v1/owntracks
   ```

6. Configure the function's authentication header/token as documented by the function implementation.
7. Set the tracker mode to **Move** during the race. Use a less frequent mode while resting.
8. Set a recognizable device or tracker ID, such as `T24`.
9. Send a test location and confirm:
   - the Edge Function returns HTTP 200;
   - a new row appears in `public.locations`;
   - the dashboard map updates within a few seconds.

Keep the OwnTracks function endpoint private to the team. If the phone is lost, revoke its device token immediately.

### Race-day checklist

- Test OwnTracks outdoors on the actual iPhone.
- Confirm the location timestamp updates after the screen locks.
- Confirm the dashboard marks a stale location when updates stop.
- Fully charge the phone and pack a power bank.
- Keep the browser tracker available as a manual fallback.
- Continue recording rounds manually if mobile coverage or GPS fails.

AirTags and Garmin LiveTrack are not integrated. AirTags are suitable for locating equipment through Find My, but they do not provide a usable live-location API for this dashboard.

## Configuration reference

For local development, copy [`.env.example`](./.env.example) to `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_T24_EVENT_ID=your-event-id
VITE_T24_EVENT_TOKEN=replace-with-a-long-random-event-token
```

After changing environment variables, restart Vite or redeploy Netlify.
