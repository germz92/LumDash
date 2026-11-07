# Multiple schedules — port this into LumDash 2.0

Instructions for the LumDash 2.0 agent. LumDash already stores more than one named schedule per event. 2.0 must use that same data. Do not invent a second schedule model.

Reference implementation in this repo:

| Layer | File |
| --- | --- |
| Schema | `backend/models/Table.js` (`schedules`, next to `programSchedule`) |
| API | `backend/server.js` (helpers above the program-schedule routes, through `DELETE /api/tables/:id/schedules/:scheduleId`) |
| Schedule page | `js/schedule.js`, `pages/schedule.html`, `css/schedule.css` |
| Mobile nav | `js/app.js` (`bindBottomNav`) |
| Public share page | `js/shared-schedule.js` (still Main only) |

If LumDash 2.0 calls this API, leave the server alone and only update the 2.0 schedule client. If 2.0 has its own copy of the server, copy the schema and routes below exactly.

## Product rules

- An event has many named schedules. Each schedule has its own program rows and the same card and table layout.
- Exactly one schedule is Main (`isMain: true`).
- `programSchedule` stays a live copy of the Main schedule’s rows. Share links and Luma keep reading `programSchedule` only. Do not point them at whichever schedule is open.
- The color legend (`scheduleColorLegend`) stays event-wide. It is not stored per schedule.
- On mobile, the first open of an event with more than one schedule shows the schedule list. Choosing one stores `schedule_picked_${eventId}`. Later short taps open that schedule and do not show the list. One schedule opens directly.
- Desktop and mobile both switch schedules from the header dropdown (the chip under the event title, labeled with the schedule name, default “Main”).
- On mobile only, a long-press of about 450ms on the Schedule nav item opens the schedule list. Moving a finger more than about 12px cancels the long-press. The follow-up click is ignored. `contextmenu` on that nav item is prevented.
- Admins, owners, and leads can create, rename, delete, and set Main. Shared users can edit rows on a schedule they can already edit. They do not see New, Rename, Set as main, or Delete schedule.
- A new schedule starts empty and is not Main.
- The last schedule cannot be deleted. Deleting Main promotes `schedules[0]` and copies that schedule’s programs into `programSchedule`.
- Import, export, and realtime edits apply only to the schedule that is open.

## Data shape

On the event document (`Table`):

```js
programSchedule: [programSchema], // mirror of the Main schedule
schedules: [{
  _id,
  name,            // required, trimmed, max 80
  isMain,          // exactly one true
  programs: [programSchema],
  createdAt,
  updatedAt,
  createdBy
}]
```

`programs` uses the existing program row shape (`date`, `name`, `startTime`, `endTime`, `location`, `photographer`, `folder`, `notes`, `done`, `important`, `rowColor`, and the collab fields). Row ids must stay stable. When a row is added to Main, save the schedule first so the subdocument gets an `_id`, then clone those programs (ids included) into `programSchedule` and save again.

Lazy migration, `ensureSchedules(table)`, runs on `GET /api/tables/:id` and on every schedule route:

- If `schedules` is empty, create `{ name: 'Main', isMain: true, programs: clone of programSchedule }` and save.
- If several are marked Main, keep the first and clear the rest, then copy that Main into `programSchedule`.

Omit `scheduleId` on a write and the server uses the Main schedule.

## API the 2.0 client must call

Auth is the existing JWT. Row writes allow admin, owner, lead, or shared user. Create, rename, set-main, and delete-schedule allow admin, owner, or lead only (`canEditSchedule`).

`GET /api/tables/:id` returns the event after migration. `schedules[].programs` is the full row list. Also read `programSchedule` as the Main mirror.

`GET /api/tables/:id/program-schedule` returns summaries only:

```js
{
  programSchedule: [ /* Main rows */ ],
  schedules: [{ _id, name, isMain, programCount }]
}
```

`PUT /api/tables/:id/program-schedule`

```js
{ programSchedule: [ /* rows for this schedule */ ], scheduleId, _intentionalDeletion?: true }
```

Updates `schedules.$[sched].programs` for that id. If that schedule is Main, also sets `programSchedule`. An empty array is rejected while that schedule still has rows, unless `_intentionalDeletion` is true. Other schedules are left untouched. Response: `{ message, scheduleId }`.

`PATCH /api/tables/:id/program-field`

```js
{ programId, field, value, sessionId, baseValue, scheduleId }
```

`field` must not contain `.` or `$`. The program is found on that schedule. Conflict check is unchanged (`409` with `{ conflict: true, ... }`). Main updates also write `programSchedule.$[prog]`.

`POST /api/tables/:id/program` body includes `date` and `scheduleId`. Owners and leads only.

`DELETE /api/tables/:id/program/:programId` with `scheduleId` in the JSON body or query.

`DELETE /api/tables/:id/program-date/:date` with `scheduleId` in the JSON body or query.

`POST /api/tables/:id/schedules` body `{ name }`. Creates an empty non-main schedule.

`PATCH /api/tables/:id/schedules/:scheduleId` body `{ name? , isMain?: true }`. `isMain: true` clears the flag on the others and copies the new Main’s programs into `programSchedule`.

`DELETE /api/tables/:id/schedules/:scheduleId` fails with 400 when it is the only schedule.

## Realtime

Join the existing event room. These payloads now include `scheduleId`:

- `programFieldUpdated`
- `programInserted`
- `programRemoved`
- `programsRemovedByDate`
- notify diffs `programAdded`, `programUpdated`, `programDeleted`

`schedulesUpdated` is `{ eventId, schedules: [{ _id, name, isMain, programCount }] }`. Use it to refresh names and the Main flag. If the open schedule was deleted, leave it. Do not replace the rows of a schedule that is not open.

`scheduleColorLegendUpdated` stays event-wide.

Apply a row event only when `scheduleId` matches the open schedule. If the payload has no `scheduleId`, apply it only while Main is open (older clients). When the user opens a schedule, reload that schedule’s rows so edits that arrived while another schedule was open are picked up.

Keep one array reference for the open schedule: `tableData.programs` and `schedules[i].programs` must be the same array. After a filter, import, or remote delete replaces the array, point the active schedule’s `programs` back at it.

Do not treat an empty load as “the server wiped our data” when switching to a new schedule. The empty-data restore prompt applies only when the loaded `scheduleId` is the one currently open. Checkbox-index preservation is also skipped when the schedule changed.

Backups and the empty-save guard are keyed by event and schedule, not by event alone (`schedule_loaded_${eventId}_${scheduleId}`, `schedule_backup_${eventId}_${scheduleId}`).

## Client behavior

State:

- `eventSchedules` — list from the event
- `activeScheduleId` — open schedule
- Remember the open schedule in both `localStorage` and `sessionStorage` as `schedule_active_${eventId}`
- Remember that the user actually chose a schedule in `localStorage` as `schedule_picked_${eventId}`. Set this only when they open a schedule, or when the event has a single schedule. Do not set it just because the page fell back to Main.
- Mobile list flag is session-only: `schedule_show_list_${eventId}`. Long-press sets it. Clear it when a schedule is opened and when a short mobile tap lands on Schedule.

On load, pick the remembered id if it still exists, otherwise Main. On mobile, if `schedule_picked_${eventId}` is missing and there is more than one schedule, show the list. Then render the selected schedule’s `programs` as today’s `tableData.programs`.

Header:

- Event title stays the event name.
- Next to it, a button (`#scheduleSwitcherBtn`) shows the open schedule name and a caret.
- Menu (`#scheduleSwitcherMenu`): each schedule (switch), then for editors: New schedule, Rename, Set as main, Delete.
- The menu works on mobile and desktop. Do not hide it under 768px.
- Give the switcher a stacking order above the toolbar (`z-index` around 30).
- The fixed header is taller with the dropdown. Measure its height and set `--header-height` as an inline style on every `.schedule-page`. An inner `.schedule-page` otherwise keeps the stylesheet default (180px desktop, 120px mobile) and the first date title slides under the header. Content padding is `var(--header-height) + 16px` on the card container and the table view.

Mobile list (`#scheduleListView`):

- Shown only when the long-press flag is set.
- Includes the schedules and, for editors, New schedule.
- No separate Back button. Choosing a schedule closes the list and opens it.
- While the list is open, hide the program container, the table, the top controls, and the switcher.

Switching calls the normal program load for that id. It does not keep the previous schedule’s rows on screen.

## Display details that are part of this work

Escape schedule text before putting it in HTML, including apostrophes (`&#39;`). A raw `'` inside `value="..."` cuts the card name off. Do this for name, location, photographer, notes, and folder in card view, table view, and the public share page.

Normalize these characters to a straight apostrophe on display and on import: U+2018, U+2019, U+201A, U+201B, U+2032, U+0091, U+0092, and the UTF-8-read-as-Latin-1 sequences for a curly apostrophe (`â€™`). Excel CSV often stores a curly apostrophe as byte `0x92`, which otherwise shows up blank.

Table notes: `.schedule-table-section td[data-field="notes"] .cell-display` uses `white-space: pre-wrap`. A table cell otherwise collapses the line breaks, so list dashes run into the previous sentence. Align that cell to the top.

Table delete: each editor row has a trash button that calls the same delete used by the cards. The click handler must accept either `.program-entry` or `tr[data-program-index]`. With `table-layout: fixed`, give the delete column a real width (about 5%). If the other columns already add up to 100%, the button is squeezed to nothing.

## Import

Import writes only the open schedule (`scheduleId` on the PUT).

Read spreadsheets with `raw: true` on both `XLSX.read` and `sheet_to_json`. Without it, a CSV date `YYYY-MM-DD` is parsed as UTC midnight and, in Pacific time, lands on the previous calendar day.

For `.csv`, decode the bytes before handing them to SheetJS (`type: 'string'`):

- Strip a UTF-8 BOM.
- Decode as UTF-8 with `fatal: true`.
- If that throws, decode as `windows-1252`.

`.xlsx` / `.xls` stay `type: 'array'`.

Turn an Excel serial into a date with `Math.floor(serial)`, then UTC: `new Date(Math.round((days - 25569) * 86400 * 1000)).toISOString().slice(0, 10)`. Keep `YYYY-MM-DD` and `MM/DD/YYYY` strings as written. Expand a 2-digit year to `20xx`.

Do not shift rows that are already saved. A bad import is fixed by importing again with Replace Current.

Run imported name, location, photographer, folder, and notes through the apostrophe normalizer before save.

## What not to change

- Do not remove `programSchedule`.
- Do not make the public share link or Luma follow the open schedule.
- Do not auto-migrate existing imported dates by adding a day.
- Do not apply another schedule’s socket event to the rows on screen.
- Do not show the schedule list on every mobile visit. Show it on the first open when there are several schedules, and after that only on long-press.
