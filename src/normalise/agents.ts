import type { Agent } from "../types.js";
import { attr, child, children, text, type XmlNode } from "../xml.js";

function parseAgent(node: XmlNode): Agent | null {
  const name = text(child(node, "name"));
  const email = text(child(node, "email"));
  const phones: Agent["phones"] = [];
  for (const phone of children(node, "telephone")) {
    const number = text(phone);
    if (number !== null) phones.push({ type: attr(phone, "type")?.toLowerCase() ?? null, number });
  }
  if (name === null && email === null && phones.length === 0) return null;
  return { name, email, phones, id: attr(node, "id") };
}

/**
 * Reads the `listingAgent` children of a listing element in document order. Telephones keep
 * their order and their `type` attribute lower-cased, or null. An agent with no name, no email
 * and no phone numbers is dropped.
 */
export function parseAgents(listing: XmlNode): Agent[] {
  const agents: Agent[] = [];
  for (const node of children(listing, "listingAgent")) {
    const agent = parseAgent(node);
    if (agent !== null) agents.push(agent);
  }
  return agents;
}
