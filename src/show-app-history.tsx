import {
  Action,
  ActionPanel,
  closeMainWindow,
  Icon,
  Keyboard,
  List,
  PopToRootType,
  showToast,
  Toast,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { loadHistory, removeFromHistory } from "./lib/load-history";
import { activateApp } from "./lib/macos";

export default function Command() {
  const { data: apps = [], isLoading, revalidate } = usePromise(loadHistory);

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
              {index > 0 && (
                <Action
                  title="Remove from History"
                  icon={Icon.EyeDisabled}
                  style={Action.Style.Destructive}
                  shortcut={Keyboard.Shortcut.Common.Remove}
                  onAction={async () => {
                    await removeFromHistory(apps, app);
                    revalidate();
                    await showToast({ style: Toast.Style.Success, title: `Removed ${app.name} from history` });
                  }}
                />
              )}
              <Action.ShowInFinder path={app.path} />
              <Action.CopyToClipboard title="Copy Bundle Identifier" content={app.bundleId} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
