import { Action, ActionPanel, closeMainWindow, List, PopToRootType } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { activateApp, getRecentApps } from "./lib/macos";

export default function Command() {
  const { data: apps = [], isLoading } = usePromise(getRecentApps);

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Filter recent apps">
      {apps.map((app, index) => (
        <List.Item
          key={app.bundleId}
          icon={{ fileIcon: app.path }}
          title={app.name}
          accessories={index === 0 ? [{ tag: "Current" }] : [{ text: `${index} back` }]}
          actions={
            <ActionPanel>
              <Action
                title="Switch to App"
                onAction={async () => {
                  // Activate first: closing the window with Immediate unmounts this view and kills the
                  // command before open() runs (ADR-009).
                  await activateApp(app);
                  await closeMainWindow({ popToRootType: PopToRootType.Immediate });
                }}
              />
              <Action.ShowInFinder path={app.path} />
              <Action.CopyToClipboard title="Copy Bundle Identifier" content={app.bundleId} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
