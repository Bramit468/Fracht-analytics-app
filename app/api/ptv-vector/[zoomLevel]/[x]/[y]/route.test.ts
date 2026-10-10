import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("PTV vector tile proxy", () => {
  it("atmeta neegzistuojančią plytelę dar prieš kreipdamasis į PTV", async () => {
    const response = await GET(new Request("http://localhost/api/ptv-vector/2/4/0"), {
      params: Promise.resolve({ zoomLevel: "2", x: "4", y: "0" }),
    });

    expect(response.status).toBe(400);
  });

  it("neleidžia mastelio virš 17 – PTV tokių plytelių neturi", async () => {
    const response = await GET(new Request("http://localhost/api/ptv-vector/18/0/0"), {
      params: Promise.resolve({ zoomLevel: "18", x: "0", y: "0" }),
    });

    expect(response.status).toBe(400);
  });
});
