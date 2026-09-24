import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("PTV map tile proxy", () => {
  it("atmeta neleidžiamą sluoksnį dar prieš kreipdamasis į PTV", async () => {
    const response = await GET(new Request("http://localhost/api/ptv-map/secret/1/0/0"), {
      params: Promise.resolve({ layer: "secret", zoomLevel: "1", x: "0", y: "0" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Neteisingi žemėlapio plytelės parametrai.",
    });
  });

  it("atmeta neegzistuojančias koordinates", async () => {
    const response = await GET(new Request("http://localhost/api/ptv-map/toll/2/4/0"), {
      params: Promise.resolve({ layer: "toll", zoomLevel: "2", x: "4", y: "0" }),
    });

    expect(response.status).toBe(400);
  });
});
