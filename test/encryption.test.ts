import { describe, it, expect } from "vitest";
import {
  createStorage,
  encryptedStorage,
  restoreSnapshot,
} from "../src";
import driver from "../src/drivers/memory";
import { TestContext, TestOptions } from "./drivers/utils";

const encryptionKey = 'e9iF+8pS8qAjnj7B1+ZwdzWQ+KXNJGUPW3HdDuMJPgI=';

describe("encryption", () => {
  it.skip("encryptedStorage", async () => {
    const storage = createStorage();
    const encStorage = encryptedStorage(storage, encryptionKey);
    await encStorage.setItem("s1:a", "test_data");
    await encStorage.setItem("s2:a", "test_data");
    await encStorage.setItem("s3:a?q=1", "test_data");
    expect(await encStorage.hasItem("s1:a")).toBe(true);
    expect(await encStorage.getItem("s1:a")).toBe("test_data");
    expect(await encStorage.getItem("s3:a?q=2")).toBe("test_data");
  });

  testEncryptionDriver({
    driver: driver(),
  });
});

export function testEncryptionDriver(opts: TestOptions) {
  const ctx: TestContext = {
    storage: encryptedStorage(createStorage({ driver: opts.driver }), encryptionKey, false),
    driver: opts.driver,
  };

  it("init", async () => {
    await restoreSnapshot(ctx.storage, { initial: "works" });
    expect(await ctx.storage.getItem("initial")).toBe("works");
    await ctx.storage.clear();
  });

  it("initial state", async () => {
    expect(await ctx.storage.hasItem("s1:a")).toBe(false);
    expect(await ctx.storage.getItem("s2:a")).toBe(null);
    expect(await ctx.storage.getKeys()).toMatchObject([]);
  });

  it("setItem", async () => {
    await ctx.storage.setItem("s1:a", "test_data");
    await ctx.storage.setItem("s2:a", "test_data");
    await ctx.storage.setItem("s3:a?q=1", "test_data");
    expect(await ctx.storage.hasItem("s1:a")).toBe(true);
    expect(await ctx.storage.getItem("s1:a")).toBe("test_data");
    expect(await ctx.storage.getItem("s3:a?q=2")).toBe("test_data");
  });

  it("getKeys", async () => {
    expect(await ctx.storage.getKeys().then((k) => k.sort())).toMatchObject(
      ["s1:a", "s2:a", "s3:a"].sort()
    );
    expect(await ctx.storage.getKeys("s1").then((k) => k.sort())).toMatchObject(
      ["s1:a"].sort()
    );
  });

  it("serialize (object)", async () => {
    await ctx.storage.setItem("/data/test.json", { json: "works" });
    expect(await ctx.storage.getItem("/data/test.json")).toMatchObject({
      json: "works",
    });
  });

  it("serialize (primitive)", async () => {
    await ctx.storage.setItem("/data/true.json", true);
    expect(await ctx.storage.getItem("/data/true.json")).toBe(true);
  });

  it("serialize (lossy object with toJSON())", async () => {
    class Test1 {
      toJSON() {
        return "SERIALIZED";
      }
    }
    await ctx.storage.setItem("/data/serialized1.json", new Test1());
    expect(await ctx.storage.getItem("/data/serialized1.json")).toBe(
      "SERIALIZED"
    );
    class Test2 {
      toJSON() {
        return { serializedObj: "works" };
      }
    }
    await ctx.storage.setItem("/data/serialized2.json", new Test2());
    expect(await ctx.storage.getItem("/data/serialized2.json")).toMatchObject({
      serializedObj: "works",
    });
  });

  // eslint-disable-next-line require-await
  it("serialize (error for non primitives)", async () => {
    class Test {}
    expect(
      ctx.storage.setItem("/data/badvalue.json", new Test())
    ).rejects.toThrow("[unstorage] Cannot stringify value!");
  });

  it("raw support", async () => {
    const value = new Uint8Array([1, 2, 3]);
    await ctx.storage.setItemRaw("/data/raw.bin", value);
    const rValue = await ctx.storage.getItemRaw("/data/raw.bin");
    const rValueLen = rValue?.length || rValue?.byteLength;
    if (rValueLen !== value.length) {
      console.log("Invalid raw value length:", rValue, "Length:", rValueLen);
    }
    expect(rValueLen).toBe(value.length);
    expect(Buffer.from(rValue).toString("base64")).toBe(
      Buffer.from(value).toString("base64")
    );
  });

  // Bulk tests
  it("setItems", async () => {
    await ctx.storage.setItems([
      { key: "t:1", value: "test_data_t1" },
      { key: "t:2", value: "test_data_t2" },
      { key: "t:3", value: "test_data_t3" },
    ]);
    expect(await ctx.storage.getItem("t:1")).toBe("test_data_t1");
    expect(await ctx.storage.getItem("t:2")).toBe("test_data_t2");
    expect(await ctx.storage.getItem("t:3")).toBe("test_data_t3");
  });

  it("getItems", async () => {
    await ctx.storage.setItem("v1:a", "test_data_v1:a");
    await ctx.storage.setItem("v2:a", "test_data_v2:a");
    await ctx.storage.setItem("v3:a?q=1", "test_data_v3:a?q=1");

    expect(
      await ctx.storage.getItems([{ key: "v1:a" }, "v2:a", { key: "v3:a?q=1" }])
    ).toMatchObject([
      {
        key: "v1:a",
        value: "test_data_v1:a",
      },
      {
        key: "v2:a",
        value: "test_data_v2:a",
      },
      {
        key: "v3:a", // key should lose the querystring
        value: "test_data_v3:a?q=1",
      },
    ]);
  });

  it("getItem - return falsy values when set in storage", async () => {
    await ctx.storage.setItem("zero", 0);
    expect(await ctx.storage.getItem("zero")).toBe(0);

    await ctx.storage.setItem("my-false-flag", false);
    expect(await ctx.storage.getItem("my-false-flag")).toBe(false);
  });

  // TODO: Refactor to move after cleanup
  if (opts.additionalTests) {
    opts.additionalTests(ctx);
  }

  it("removeItem", async () => {
    await ctx.storage.removeItem("s1:a", false);
    expect(await ctx.storage.hasItem("s1:a")).toBe(false);
    expect(await ctx.storage.getItem("s1:a")).toBe(null);
  });

  it("clear", async () => {
    await ctx.storage.clear();
    expect(await ctx.storage.getKeys()).toMatchObject([]);
    // ensure we can clear empty storage as well: #162
    await ctx.storage.clear();
    expect(await ctx.storage.getKeys()).toMatchObject([]);
  });

  it("dispose", async () => {
    await ctx.storage.dispose();
  });
}