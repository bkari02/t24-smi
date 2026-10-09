# T24 Team Dashboard

Mobile-first race control for a five-person 24-hour triathlon relay.

The dashboard tracks the active participant, next handover, round times, phase countdowns, and the latest GPS position. Manual round and handover actions are the source of truth; GPS is an aid and can be unavailable without stopping the race log.

## Included

- Swim, bike, and run race board
- One-tap round start and finish
- Next-participant selection and handover
- Rolling handover estimate from recent rounds
- Shared round history through Supabase
- Swim course preview from `public/courses/swim.gpx`
- Leaflet/OpenStreetMap map
- Supabase location storage and Realtime updates when configured
- OwnTracks locations for all participants
- Manual and automatic location refresh every 30 seconds
- Clickable participant rows for map focus
- Editable per-participant pace estimates in [`public/data/pace-estimates.csv`](./public/data/pace-estimates.csv)
- Fan, team-member, and athlete views
- Viewer presence estimate and cheers
- Minnit community chat above the planned schedule

## Run locally

Use Node 26 through nvm:

```bash
nvm install
nvm use
npm install
npm run dev
```

Open the local URL shown by Vite. Supabase configuration is required for shared race state; the app does not create local rounds when the backend is unavailable.

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
4. Paste and run [`supabase/migrations/20261008233000_create_shared_event_state.sql`](./supabase/migrations/20261008233000_create_shared_event_state.sql).
5. Generate a long random event token. Keep it private.
6. Insert the event access row:

```sql
insert into public.event_access (event_id, access_token)
values ('your-event-id', 'PASTE_A_LONG_RANDOM_TOKEN_HERE');
```

7. Insert the shared event and members, replacing `YOUR_EVENT_ID`:

```sql
insert into public.events(id, name, event_started_at, current_phase, active_participant_id, next_participant_id)
values ('YOUR_EVENT_ID', 'T24 Team', now(), 'Swim', 'p1', 'p2');

insert into public.team_members(event_id, participant_id, name, color, sort_order) values
('YOUR_EVENT_ID', 'p1', 'Kieeesch', '#f26b4f', 1),
('YOUR_EVENT_ID', 'p2', 'Lilli', '#4cc9a4', 2),
('YOUR_EVENT_ID', 'p3', 'Jule', '#f6c85f', 3),
('YOUR_EVENT_ID', 'p4', 'Matze', '#91a7ff', 4),
('YOUR_EVENT_ID', 'p5', 'Benni', '#d28cff', 5);
```

9. Apply [`supabase/migrations/20261009120000_add_member_presence_cheers.sql`](./supabase/migrations/20261009120000_add_member_presence_cheers.sql).
10. Provision the shared team password as a SHA-256 digest. The current frontend uses `p1` as the shared team login identity:

```sql
insert into public.member_login_codes(event_id, participant_id, code_hash, expires_at)
values (
  'YOUR_EVENT_ID',
  'p1',
  encode(digest('CHOOSE_A_SHARED_TEAM_PASSWORD', 'sha256'), 'hex'),
  now() + interval '365 days'
);
```

The password is a presentation-level access gate, not a security boundary. The fan view does not show race-control controls; do not treat the bundled frontend event token as a secret.

8. In **Project Settings → API**, copy:
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

### View modes

The public default is the fan view:

```text
https://your-site.example/
```

Team members can use the shared password to unlock controls, or open:

```text
https://your-site.example/?view=member
```

Athletes can open a focused view for their participant:

```text
https://your-site.example/?view=athlete&participant=p1
```

The athlete view shows approximate GPX route progress, completed distance, and remaining distance. GPS position, route crossings, and sparse OwnTracks updates can make this estimate inaccurate.

All views can send a cheer to the active athlete. Viewer counts are estimates based on browser heartbeats and can lag by several minutes.

### Minnit event chat

The dashboard embeds the team’s public Minnit room above the planned schedule in all views. Minnit handles chat identities, moderation, and message storage. The current room is configured in [`src/EventChat.tsx`](./src/EventChat.tsx). To override it for another environment, set:

```text
VITE_MINNIT_CHAT_URL=https://organizations.minnit.chat/your-chat-path?embed
```

The room’s generated Minnit embed script is loaded by the browser. Chat content is external to the dashboard and is subject to Minnit’s availability and policies.

### 4. Test the deployment

Open the Netlify URL on two devices:

1. Open the dashboard on two devices.
2. Start a round on the first device.
3. Confirm the active round appears on the second device.
4. Perform a handover and confirm both devices update.
5. Send an OwnTracks test location and confirm its marker appears.

## OwnTracks configuration

OwnTracks is preferable for race-day tracking because it can send background location updates while the iPhone is locked. Install it on one iPhone per participant so all five locations can be displayed. The active participant is rendered with a larger marker and white outline; the other four use their team colors.

### Important current limitation

The repository includes the OwnTracks Supabase Edge Function at [`supabase/functions/owntracks/index.ts`](./supabase/functions/owntracks/index.ts). Do **not** point OwnTracks directly at Supabase REST with a service-role key. The function:

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

Use a separate device token for each phone. Do not reuse the dashboard event token.

### Deploy the OwnTracks function

Install the Supabase CLI, log in, and link the local project:

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy owntracks --no-verify-jwt
```

`--no-verify-jwt` is required because OwnTracks uses Basic authentication rather than a Supabase user JWT. The function performs its own device-token authentication.

Set these function secrets. Replace every placeholder before running:

```bash
supabase secrets set \
  SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY" \
  T24_EVENT_ID="YOUR_EVENT_ID" \
  'OWNTRACKS_DEVICES={"T1":{"participantId":"p1","token":"PHONE_1_TOKEN"},"T2":{"participantId":"p2","token":"PHONE_2_TOKEN"},"T3":{"participantId":"p3","token":"PHONE_3_TOKEN"},"T4":{"participantId":"p4","token":"PHONE_4_TOKEN"},"T5":{"participantId":"p5","token":"PHONE_5_TOKEN"}}'
```

Find `YOUR_PROJECT_REF` in the Supabase project URL (`https://YOUR_PROJECT_REF.supabase.co`). Find `YOUR_SERVICE_ROLE_KEY` under **Project Settings → API → Secret keys** or the legacy `service_role` key. It is a server secret: never put it in Netlify, OwnTracks, GitHub, or the browser.

The deployed endpoint is:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/owntracks
```

To update a device mapping, run `supabase secrets set` again and redeploy the function. The participant IDs must match the dashboard defaults:

| Participant ID | Name | OwnTracks device ID |
|---|---|---|
| `p1` | Kieeesch | `T1` |
| `p2` | Lilli | `T2` |
| `p3` | Jule | `T3` |
| `p4` | Matze | `T4` |
| `p5` | Benni | `T5` |

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

6. Set the OwnTracks device ID (`tid`) to the matching ID from the table, such as `T1`.
7. Configure HTTP Basic Authentication:
   - username: the device ID, for example `T1`
   - password: that device's token from `OWNTRACKS_DEVICES`
8. Set the tracker mode to **Move** during the race. Use a less frequent mode while resting.
9. Send a test location and confirm:
   - the Edge Function returns HTTP 200;
   - a new row appears in `public.locations`;
   - the dashboard map updates within a few seconds;
   - the correct participant marker moves.

Keep the OwnTracks function endpoint private to the team. If the phone is lost, revoke its device token immediately.

### Race-day checklist

- Test OwnTracks outdoors on the actual iPhone.
- Confirm the location timestamp updates after the screen locks.
- Confirm the dashboard marks a stale location when updates stop.
- Fully charge the phone and pack a power bank.
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

## Pace estimates

Edit [`public/data/pace-estimates.csv`](./public/data/pace-estimates.csv) before the event. Times are minutes for one round:

```csv
participant_id,participant_name,swim_minutes,bike_minutes,run_minutes
p1,Kieeesch,20,48,25
```

The dashboard uses the matching participant and phase estimate for the first lap. Once at least one lap in the current phase has been completed, the estimate switches to the median of the most recent three completed laps in that phase. This means the second lap onward is based on observed race times rather than the CSV default.
