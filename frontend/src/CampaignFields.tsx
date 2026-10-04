import { useState } from "react";
import {
  MAX_DESCRIPTION_BYTES,
  MAX_NAME_BYTES,
  byteLength,
  safeImageUrl,
  validateInfo,
  type CampaignInfoData,
} from "./lib/campaignInfo";

/** Name, description and image inputs, shared by the public and the private "start a campaign" forms. */
export function CampaignFields({
  value,
  onChange,
}: {
  value: CampaignInfoData;
  onChange: (v: CampaignInfoData) => void;
}) {
  const [touched, setTouched] = useState(false);
  const error = touched ? validateInfo(value) : null;
  const preview = value.imageURI.trim() ? safeImageUrl(value.imageURI) : null;
  const set = (patch: Partial<CampaignInfoData>) =>
    onChange({ ...value, ...patch });
  const input = "w-full rounded-md bg-slate-800 px-3 py-2 text-sm";

  return (
    <div className="space-y-3">
      <div>
        <input
          className={input}
          placeholder="Campaign name"
          value={value.name}
          onBlur={() => setTouched(true)}
          onChange={(e) => set({ name: e.target.value })}
        />
        <div className="mt-1 text-right text-xs text-slate-500">
          {byteLength(value.name.trim())}/{MAX_NAME_BYTES}
        </div>
      </div>

      <div>
        <textarea
          className={`${input} min-h-28`}
          placeholder="Tell people what this is for, who it helps and how the money will be used"
          value={value.description}
          onBlur={() => setTouched(true)}
          onChange={(e) => set({ description: e.target.value })}
        />
        <div className="mt-1 text-right text-xs text-slate-500">
          {byteLength(value.description.trim())}/{MAX_DESCRIPTION_BYTES}
        </div>
      </div>

      <div>
        <input
          className={input}
          placeholder="Image link (optional): ipfs://… or https://…"
          value={value.imageURI}
          onBlur={() => setTouched(true)}
          onChange={(e) => set({ imageURI: e.target.value })}
        />
        <p className="mt-1 text-xs text-slate-500">
          Only a link is stored on-chain, not the image. Prefer an{" "}
          <span className="font-mono">ipfs://</span> link so it does not depend
          on one website. Everyone who views the campaign loads this image from
          that host, which lets the host see their IP address.
        </p>
        {preview && (
          <img
            src={preview}
            alt="Preview"
            referrerPolicy="no-referrer"
            className="mt-2 max-h-40 rounded-md object-cover"
            onError={(e) =>
              ((e.target as HTMLImageElement).style.display = "none")
            }
          />
        )}
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}

/** Image, name and description at the top of a campaign card. */
export function CampaignHeader({
  id,
  info,
}: {
  id: bigint;
  info: CampaignInfoData;
}) {
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const url = info.imageURI ? safeImageUrl(info.imageURI) : null;
  const long = info.description.length > 220;

  return (
    <div className="mb-3">
      {url && !failed && (
        <img
          src={url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="mb-3 h-56 w-full rounded-lg object-cover"
          onError={() => setFailed(true)}
        />
      )}
      <h3 className="text-lg font-semibold">
        {info.name || `Campaign #${id.toString()}`}
      </h3>
      {info.description && (
        <p
          className={`mt-1 whitespace-pre-wrap break-words text-sm text-slate-300 ${
            long && !open ? "line-clamp-3" : ""
          }`}
        >
          {info.description}
        </p>
      )}
      {long && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="mt-1 text-xs text-sky-300 hover:underline"
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
