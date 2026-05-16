/**
 * Builders for the mocked `fetch` Response objects the request layer consumes.
 *
 * `WompiRequest` reads success bodies with `response.text()` (so an empty `2xx`
 * resolves to `undefined`) and error bodies with `response.json()` — the helpers
 * below mirror that split.
 */

/** A successful (2xx) response carrying a JSON body. */
export const okJson = (body: unknown, status = 200) => ({
  ok: true,
  status,
  text: async () => JSON.stringify(body),
});

/** A successful (2xx) response with an empty body, e.g. `POST /transactions/{id}/void`. */
export const okEmpty = (status = 201) => ({
  ok: true,
  status,
  text: async () => "",
});

/** An error (non-2xx) response carrying a JSON body. */
export const errorJson = (status: number, body: unknown) => ({
  ok: false,
  status,
  json: async () => body,
});
