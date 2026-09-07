"use client";

import { IntegrationProviderCards } from "./IntegrationProviderCards";
import { ProviderFieldsPanel } from "./ProviderFieldsPanel";
import { Banner } from "./panel-ui";
import type { IntegrationUiPermissions, IntegrationUiSnapshot, SchedulerUiStatus } from "./model";
import { useIntegrationSettings } from "./useIntegrationSettings";

export function IntegrationSettingsManager({ initialProviders, permissions, scheduler }: {
  initialProviders: IntegrationUiSnapshot[];
  permissions: IntegrationUiPermissions;
  scheduler: SchedulerUiStatus;
}) {
  const state = useIntegrationSettings(initialProviders);
  const encryptionMissing = !state.providers.filter((item) => item.provider !== "SYSTEM").every((item) => item.encryptionKeyConfigured);

  // The page's <main> already sets the vertical rhythm; a second space-y here
  // just made the gap depend on which wrapper you happened to look at.
  return (
    <div className="space-y-4">
      {encryptionMissing && (
        <Banner
          tone="pending"
          role="alert"
          title="يجب إضافة مفتاح تشفير إعدادات التكاملات إلى إعدادات السيرفر قبل حفظ البيانات السرية."
          meta="إعداد أولي يُنفذ مرة واحدة فقط. لا يمكن إدخال المفتاح أو توليده أو عرضه من هذه الصفحة."
        >
          <code className="inline-block rounded-md border border-amber-200 bg-white px-2 py-1 text-xs" dir="ltr">
            INTEGRATION_SETTINGS_ENCRYPTION_KEY
          </code>
        </Banner>
      )}

      <IntegrationProviderCards providers={state.providers} active={state.active} onOpen={state.chooseProvider} />
      <ProviderFieldsPanel
        snapshot={state.snapshot}
        permissions={permissions}
        scheduler={scheduler}
        drafts={state.drafts}
        dirty={state.dirty}
        busy={state.busy}
        notice={state.notice}
        lastCandidateTest={state.lastCandidateTest}
        lastActiveTest={state.lastActiveTest}
        webhookReveal={state.webhookReveal}
        onDraft={state.updateDraft}
        onSave={state.saveChanges}
        onTestCandidate={state.testCandidate}
        onTestActive={state.testActive}
        onActivate={state.activateCandidate}
        onDiscard={state.discardCandidate}
        onRotateWebhook={state.rotateWebhook}
        onDelete={state.deleteField}
        onToggle={state.toggleProvider}
        onNotice={state.setNotice}
      />
    </div>
  );
}
