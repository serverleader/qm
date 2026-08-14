---
name: open-montage
description: Produce a finished multi-scene video (explainer, montage, trailer, "like this" remake) with OpenMontage. SuperGrok generates every image and motion clip. Use for a film with a script, several scenes, narration, or a real timeline. Do not use for a single still-to-clip request ... that is the Imagine Video model.
requiredCapabilities:
  - egress:api.x.ai
  - egress:github.com
---

# OpenMontage (SuperGrok generation)

Load this when the person wants a **produced video**: several scenes, a script, captions, a soundtrack, or a remake of a reference clip. SuperGrok Heavy is the generator. Kling, Veo, Flux, fal, and other paid vendors stay off unless the person names one.

A single still plus "make this move" is **not** this skill. Switch to the Imagine Video model and generate one clip.

## Preconditions

```bash
test -n "$XAI_API_KEY" && echo "supergrok: token present" || echo "supergrok: missing"
test -n "$SUPERGROK" && echo "supergrok: $SUPERGROK"
command -v ffmpeg || echo "ffmpeg: missing ... the sandbox image needs ffmpeg"
```

If `XAI_API_KEY` is missing, stop. SuperGrok is not signed in for this computer. Point them at Admin → SuperGrok sign-in. Do not ask them to paste an `xai-` API key.

If `ffmpeg` is missing, stop and say the sandbox image must be rebuilt with ffmpeg.

## Checkout

Reuse `openmontage/` if it already has `AGENT_GUIDE.md`. Otherwise clone the QM fork (not upstream):

```bash
git clone --depth 1 https://github.com/serverleader/OpenMontage.git openmontage
cd openmontage
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
(cd remotion-composer && npm install)
```

Work inside `openmontage/`. Read `AGENT_GUIDE.md`, then the pipeline manifest, then the stage director for the current stage.

## Generation contract (binding)

Every image and motion clip goes through SuperGrok:

- images: `grok_image` (`grok-imagine-image`)
- clips: `grok_video` (`grok-imagine-video-1.5`)
- selectors: `preferred_provider="grok"`
- env already sets `OPENMONTAGE_PREFERRED_PROVIDER=grok` and `SUPERGROK=1`

Do not call Kling, Veo, Runway, Flux, MiniMax, Seedance, or fal. If a director skill names those, keep SuperGrok anyway.

Cost for SuperGrok generation is subscription compute, not API credits. Do not quote xAI per-second prices as a bill.

## Run

1. Pick a pipeline (`animated-explainer`, `cinematic`, `documentary-montage`, `animation`, …).
2. Preflight:

```bash
python -c "from tools.tool_registry import registry; import json; registry.discover(); print(json.dumps(registry.provider_menu_summary(), indent=2))"
```

Confirm `grok_image` and `grok_video` are available.

3. Execute stage by stage. Pause at human-approval gates and end the turn.
4. Deliver `projects/<id>/renders/final.mp4`. Send that file. Do not claim a live URL unless `publish` actually returned one.

## One-shot vs studio

| Ask | Path |
|---|---|
| One still, one clip | Imagine Video model, not this skill |
| Script + several scenes + edit | This skill, SuperGrok for every generated asset |
| Real footage only, no generation | This skill, documentary-montage, no `grok_video` |
