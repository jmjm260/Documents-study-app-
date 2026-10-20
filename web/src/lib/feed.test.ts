import { describe, expect, it } from "vitest";
import { FeedError, isPrivateIp, validateFeedUrl } from "./feed";

describe("validateFeedUrl", () => {
  it("acepta un feed de Canvas", () => {
    const url = validateFeedUrl("https://escuela.instructure.com/feeds/calendars/user_abc123.ics");
    expect(url.hostname).toBe("escuela.instructure.com");
  });

  it.each([
    "no es url",
    "http://escuela.instructure.com/feeds/calendars/user_abc.ics",
    "https://escuela.instructure.com/courses/1",
    "https://user:pass@escuela.instructure.com/feeds/calendars/user_abc.ics",
    "https://escuela.instructure.com:8080/feeds/calendars/user_abc.ics",
  ])("rechaza %s", (input) => {
    expect(() => validateFeedUrl(input)).toThrow(FeedError);
  });
});

describe("isPrivateIp", () => {
  it.each(["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.20.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1"])(
    "bloquea %s",
    (ip) => expect(isPrivateIp(ip)).toBe(true)
  );
  it.each(["8.8.8.8", "52.1.2.3", "2606:4700::1111"])("permite %s", (ip) => expect(isPrivateIp(ip)).toBe(false));
});
