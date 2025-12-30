import { Select } from "../../../shared/components/Select";
import { cn } from "../../../shared/lib/cn";
import { LANGUAGE_OPTIONS } from "../../../app/lib/languageOptions";
import type { SettingsState } from "../../settings/settingsSlice";

export type CaptionSetupPanelProps = {
  settings: SettingsState;
  captionControlsDisabled: boolean;
  isCantoneseLanguage: boolean;
  isSecondCaptionActive: boolean;
  secondCaptionLanguage: "yue" | "zh" | "en";
  onLanguageChange: (value: SettingsState["language"]) => void;
  onChineseStyleChange: (value: SettingsState["chineseStyle"]) => void;
  onToggleSecondCaption: () => void;
  onSecondCaptionLanguageChange: (value: "yue" | "zh" | "en") => void;
  generateCaptionLabel: string;
  onGenerateCaptions: () => void;
  isGenerateDisabled: boolean;
};

export function CaptionSetupPanel({
  settings,
  captionControlsDisabled,
  isCantoneseLanguage,
  isSecondCaptionActive,
  secondCaptionLanguage,
  onLanguageChange,
  onChineseStyleChange,
  onToggleSecondCaption,
  onSecondCaptionLanguageChange,
  generateCaptionLabel,
  onGenerateCaptions,
  isGenerateDisabled
}: CaptionSetupPanelProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-[11px] font-semibold text-slate-400" htmlFor="languageSelect">
          Language
        </label>
        <Select
          className={cn("stt-select-dark", captionControlsDisabled && "opacity-60")}
          id="language"
          buttonId="languageSelect"
          value={String(settings.language)}
          options={LANGUAGE_OPTIONS}
          onChange={(value) => onLanguageChange(value as SettingsState["language"])}
          disabled={captionControlsDisabled}
        />
      </div>
      <div className="space-y-2">
        <label className="text-[11px] font-semibold text-slate-400" htmlFor="chineseStyleSelect">
          Cantonese Output Style
        </label>
        <Select
          className={cn(
            "stt-select-dark",
            (!isCantoneseLanguage || captionControlsDisabled || isSecondCaptionActive) && "opacity-60"
          )}
          id="chineseStyle"
          buttonId="chineseStyleSelect"
          value={String(settings.chineseStyle)}
          options={[
            { value: "written", label: "Written (書面語)" },
            { value: "spoken", label: "Spoken (口語)" }
          ]}
          onChange={(value) => onChineseStyleChange(value as SettingsState["chineseStyle"])}
          disabled={!isCantoneseLanguage || captionControlsDisabled || isSecondCaptionActive}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold text-slate-400" htmlFor="secondCaptionLanguageSelect">
            Subtitles Translation (Beta)
          </label>
          <button
            className={cn(
              "inline-flex items-center gap-2 text-[10px] font-medium transition",
              isSecondCaptionActive ? "text-slate-200" : "text-slate-500"
            )}
            onClick={onToggleSecondCaption}
            type="button"
            disabled={captionControlsDisabled}
          >
            <span
              className={cn(
                "relative inline-flex h-4 w-7 items-center rounded-full border transition",
                isSecondCaptionActive ? "border-slate-500 bg-[#1b1b22]" : "border-slate-700 bg-[#151515]"
              )}
            >
              <span
                className={cn(
                  "absolute h-3 w-3 rounded-full bg-white transition",
                  isSecondCaptionActive ? "translate-x-3" : "translate-x-1"
                )}
              />
            </span>
          </button>
        </div>
        <Select
          className={cn("stt-select-dark", (!isSecondCaptionActive || captionControlsDisabled) && "opacity-60")}
          id="secondCaptionLanguage"
          buttonId="secondCaptionLanguageSelect"
          value={secondCaptionLanguage}
          options={[{ value: "yue", label: "English" }]}
          onChange={(value) => onSecondCaptionLanguageChange(value as "yue" | "zh" | "en")}
          disabled={!isSecondCaptionActive || captionControlsDisabled}
        />
      </div>
      <div className="pt-2">
        <button
          className={cn(
            "inline-flex w-full items-center justify-center rounded-md bg-[#1b1b22] px-3 py-2.5 text-[11.5px] font-semibold text-slate-200 transition hover:bg-[#26262f]",
            isGenerateDisabled ? "cursor-not-allowed opacity-60 hover:bg-[#1b1b22]" : ""
          )}
          onClick={onGenerateCaptions}
          disabled={isGenerateDisabled}
          type="button"
        >
          {generateCaptionLabel}
        </button>
      </div>
    </div>
  );
}
