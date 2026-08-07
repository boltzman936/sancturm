const STORAGE_KEY = "sancturm:device_id";

/**
 * A random id generated once per browser and persisted to localStorage —
 * this is how an anonymous upload or rating is tied back to "whoever
 * submitted it" without requiring login. Matches the schema's
 * `uploaded_by_device` / `resource_ratings.device_id` columns.
 */
export function getDeviceId(): string {
  let id = window.localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}
