import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderSchemaDomainArtifacts } from "./schemaDomainCodegen";
import {
  assertDomainContractVersionBumped,
  previousDomainContracts,
  readPluginDescriptors,
  renderRegistry,
} from "./registryCodegen";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const domainRoot = "apps/shared/src/protocol/lobbyRpc/domains";
const registryPath = "apps/shared/src/protocol/lobbyRpc/registry.generated.ts";

export function generateLobbyProtocol(
  root: string,
  check: boolean,
  allowDelete: readonly string[] = [],
): void {
  const artifacts = renderSchemaDomainArtifacts(root);
  const descriptors = readPluginDescriptors(
    { repositoryRoot: root },
    artifacts,
  );
  assertDomainContractVersionBumped(
    descriptors,
    previousDomainContracts({ repositoryRoot: root }),
  );
  const output = new Map(
    artifacts.map(({ relative, content }) => [relative, content]),
  );
  output.set(registryPath, renderRegistry(descriptors));

  const directory = path.join(root, domainRoot);
  const previous = fs.existsSync(directory) ? fs.readdirSync(directory) : [];
  const removed = previous.filter(
    (entry) => !output.has(`${domainRoot}/${entry}`),
  );
  for (const entry of removed) {
    if (!allowDelete.includes(entry.replace(/\.ts$/, "")))
      throw new Error(`domain removal requires --allow-delete ${entry}`);
  }
  for (const [relative, content] of output) {
    const target = path.join(root, relative);
    if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === content)
      continue;
    if (check) throw new Error(`stale protocol artifact: ${relative}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${process.pid}`;
    fs.writeFileSync(temporary, content);
    fs.renameSync(temporary, target);
  }
  if (check && removed.length)
    throw new Error(`stale protocol domain(s): ${removed.join(", ")}`);
  if (!check)
    for (const entry of removed) fs.unlinkSync(path.join(directory, entry));
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--check") continue;
    if (args[index] !== "--root" && args[index] !== "--allow-delete")
      throw new Error(`unknown protocol argument: ${args[index]}`);
    if (!args[index + 1] || args[index + 1].startsWith("--"))
      throw new Error(`${args[index]} requires a value`);
    index += 1;
  }
  const check = args.includes("--check");
  const allowDelete = args.flatMap((arg, index) =>
    arg === "--allow-delete" ? [args[index + 1]] : [],
  );
  const rootIndex = args.indexOf("--root");
  const root =
    rootIndex < 0 ? repositoryRoot : path.resolve(args[rootIndex + 1]);
  generateLobbyProtocol(root, check, allowDelete);
  console.log(`[lobby-protocol] ${check ? "fresh" : "generated"}`);
}
