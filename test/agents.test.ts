import { describe, expect, it } from "vitest";
import { parseAgents } from "../src/normalise/agents.js";
import { parseXml } from "../src/xml.js";

function run(inner: string) {
  const root = parseXml(`<residential>${inner}</residential>`);
  if (root === null) throw new Error("test xml has no root");
  return parseAgents(root);
}

describe("parseAgents", () => {
  it("returns an empty list when there is no listingAgent", () => {
    expect(run("<headline>Sample</headline>")).toEqual([]);
  });

  it("reads a full agent", () => {
    expect(
      run(`
        <listingAgent id="1">
          <name>Alex Sample</name>
          <email>alex@example.com</email>
          <telephone type="BH">(02) 5550 0100</telephone>
          <telephone type="mobile">0491 570 006</telephone>
        </listingAgent>`),
    ).toEqual([
      {
        name: "Alex Sample",
        email: "alex@example.com",
        phones: [
          { type: "bh", number: "(02) 5550 0100" },
          { type: "mobile", number: "0491 570 006" },
        ],
        id: "1",
      },
    ]);
  });

  it("keeps phones in document order", () => {
    const [agent] = run(`
      <listingAgent>
        <name>Alex Sample</name>
        <telephone type="mobile">0491 570 156</telephone>
        <telephone type="BH">(02) 5550 0100</telephone>
        <telephone type="mobile">0491 570 006</telephone>
      </listingAgent>`);
    expect(agent?.phones.map((p) => p.number)).toEqual([
      "0491 570 156",
      "(02) 5550 0100",
      "0491 570 006",
    ]);
  });

  it("keeps agents in document order", () => {
    const agents = run(`
      <listingAgent id="2"><name>Jordan Example</name></listingAgent>
      <listingAgent id="1"><name>Alex Sample</name></listingAgent>`);
    expect(agents.map((a) => a.name)).toEqual(["Jordan Example", "Alex Sample"]);
    expect(agents.map((a) => a.id)).toEqual(["2", "1"]);
  });

  it("lower-cases the phone type and uses null when it is missing or empty", () => {
    const [agent] = run(`
      <listingAgent>
        <name>Alex Sample</name>
        <telephone type="BH">1</telephone>
        <telephone type=" Mobile ">2</telephone>
        <telephone>3</telephone>
        <telephone type="">4</telephone>
      </listingAgent>`);
    expect(agent?.phones.map((p) => p.type)).toEqual(["bh", "mobile", null, null]);
  });

  it("trims names, emails and phone numbers", () => {
    const [agent] = run(`
      <listingAgent>
        <name>  Jordan Example </name>
        <email> jordan@example.com </email>
        <telephone> 0491 570 156 </telephone>
      </listingAgent>`);
    expect(agent).toMatchObject({
      name: "Jordan Example",
      email: "jordan@example.com",
      phones: [{ type: null, number: "0491 570 156" }],
    });
  });

  it("uses null for a missing id, name or email", () => {
    const [agent] = run("<listingAgent><telephone>0491 570 006</telephone></listingAgent>");
    expect(agent).toEqual({
      name: null,
      email: null,
      phones: [{ type: null, number: "0491 570 006" }],
      id: null,
    });
  });

  it("keeps an agent that has only a name, only an email or only a phone", () => {
    const agents = run(`
      <listingAgent><name>Alex Sample</name></listingAgent>
      <listingAgent><email>alex@example.com</email></listingAgent>
      <listingAgent><telephone>0491 570 006</telephone></listingAgent>`);
    expect(agents).toHaveLength(3);
  });

  it("drops an agent with no name, no email and no phones", () => {
    const agents = run(`
      <listingAgent id="1"/>
      <listingAgent id="2"><name>Alex Sample</name></listingAgent>
      <listingAgent id="3"><name/><email/><telephone/></listingAgent>`);
    expect(agents.map((a) => a.id)).toEqual(["2"]);
  });

  it("drops an agent whose fields are only whitespace", () => {
    const agents = run(`
      <listingAgent id="1">
        <name>   </name>
        <email> </email>
        <telephone type="BH">  </telephone>
      </listingAgent>`);
    expect(agents).toEqual([]);
  });

  it("drops empty phones but keeps the agent when something else is present", () => {
    const [agent] = run(`
      <listingAgent>
        <name>Alex Sample</name>
        <telephone type="BH"> </telephone>
        <telephone type="mobile">0491 570 006</telephone>
      </listingAgent>`);
    expect(agent?.phones).toEqual([{ type: "mobile", number: "0491 570 006" }]);
  });

  it("takes the first name and email when repeated", () => {
    const [agent] = run(`
      <listingAgent>
        <name>Alex Sample</name><name>Jordan Example</name>
        <email>alex@example.com</email><email>jordan@example.com</email>
      </listingAgent>`);
    expect(agent).toMatchObject({ name: "Alex Sample", email: "alex@example.com" });
  });
});
