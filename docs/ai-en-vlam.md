# AI and VLAM

Transparency about the writing assistant ("Schrijfhulp") in Schrijver.

## What it does

- Suggests changes to a selection or a page: a shorter sentence, a B1 rewrite, a fixed action or a free prompt.
- Shows each suggestion as a word diff. The colleague chooses "Overnemen" or "Verwerpen".
- "Samenvatting" writes its suggestion only into the page's description field ("Gebruik als samenvatting"), never into the text.
- On "Nieuwe pagina", "Maak een opzet" turns a description of the page (up to 2000 characters) into a suggested title and an outline in Markdown. The form shows both to check and edit; "Pagina maken" opens the editor with them as an unsaved draft in that browser. Nothing reaches the forge before "Concept bewaren".
- Never writes into a page by itself. Nothing reaches the forge unless the colleague takes the suggestion and then saves.

## What it does not do

- It makes no decisions about people and no automated decisions with legal or similar effect.
- It does not publish: a human editor still reviews and merges every proposal.
- It does not see who you are.

## What is sent

Sent to VLAM: the text being worked on (selection or page, up to 20 000 characters), the instruction (a fixed action or the free prompt, up to 1000 characters) and the site's writing guide (`schrijfwijzer`) as the system prompt. For "Maak een opzet": the description instead of page text, with the same writing guide.

Page text travels between `<tekst>` tags and a description between `<beschrijving>` tags; the system prompt declares both data, never instructions, and closing tags inside them are neutralised. The answer is accepted only as one JSON object with the expected string fields. Every action goes through the same endpoint (`/api/assistent`), with the same rate limit (20 requests per minute per user), token cap (4000) and timeout.

Never sent: name, e-mail address, `sub`, pseudonym or GitHub login. Page text itself can contain personal data; the help page tells colleagues what to leave out.

## Model and provider

VLAM, operated by SSC-ICT, over an OpenAI-compatible API (`VLAM_API_URL`, key `VLAM_KEY_PREPAID`, model `VLAM_MODEL`, default `vlam-llm-large-prepaid`). Calls are logged with site, action and token counts only, never content. Streaming is off, a deviation from the design (section 8.2): the answer is one JSON object (suggestion plus explanation) that is only usable once complete.

## Human in the loop

Every suggestion is read and accepted or rejected by the colleague, and every proposal is reviewed by the site's editorial team before it is merged. The help page says "Controleer elk voorstel zelf".

## Statements to obtain from SSC-ICT

- [ ] Role of SSC-ICT (processor or controller) and the agreement that applies to our department.
- [ ] Retention of prompts and outputs, including logs and abuse monitoring, and who can read them.
- [ ] Written confirmation that prompts and outputs are not used to train or fine-tune any model, now or later.
- [ ] Processing location (country, datacenter) and any sub-processor or foreign-hosted underlying model.
- [ ] Maximum information classification and personal-data category allowed in prompts.
- [ ] Status of the prepaid key: owner, rotation, usage logging.
- [ ] Incident contact and breach notification time.

## Algoritmeregister

Assessment: **registration is likely not required, but record the decision.** The register is aimed at algorithms that have impact on citizens or that make or support decisions with legal consequences, and at high-risk AI under the AI Act. Schrijver's assistant is a writing aid for employees: it only suggests, a person decides on every change, and a second person reviews every proposal. Criteria to re-check if the use changes: it starts to act on people (selection, ranking, assessment), it writes without review, it is offered to citizens, or the organisation's own policy asks for registration of all LLM use. Low-risk entries may still be registered voluntarily; check the current guidance of the register and the organisation's policy, and note the outcome in the verwerkingsregister.

## AI Act

At most a limited-risk transparency duty applies: users must know they interact with an AI system. The panel is labelled "Schrijfhulp" and the help page states the model and provider; adding "AI" to the panel itself is the safest reading. The assistant is not high-risk (no use case listed in Annex III). The AI-literacy duty for deployers applies to the colleagues using it; the help page is the start of that. Check the dates and wording against the current text of the regulation before the pilot goes live.

## Testing Schrijfhulp locally

In the local preview (`SCHRIJVER_FAKE_FORGE=1` with `NODE_ENV` development or test, as in the [README](../README.md)) and without `VLAM_API_URL`, `/api/assistent` answers itself instead of with an error, so the panel and "Maak een opzet" can be tried end to end. The answers are deterministic and derived from the request:

- "Korter" keeps the text up to the end of its first sentence, with any heading before it.
- "Samenvatting" gives the first sentence of the text without its headings.
- "Naar B1", "Actiever", "Kopjes voorstellen" and "Eigen opdracht" put one word in capitals.
- "Maak een opzet" takes the title from the start of the description (at most eight words) and returns a fixed outline with the description under its first heading.

Every explanation starts with "Testantwoord, geen AI:", and nothing leaves the machine. Production never answers this way: the fake sits behind the same development guard as the other bypasses, and without `VLAM_API_URL` production answers 503 as before.

### Against a real model

Set `VLAM_API_URL` and the preview asks that model instead. The Schrijver server, not the browser, makes the call, with the OpenAI SDK (`src/lib/assistant/vlam.ts`):

- `POST {VLAM_API_URL}/v1/chat/completions`. Schrijver appends `/v1` itself: `VLAM_API_URL` is the base address without `/v1` and without a trailing slash.
- `Authorization: Bearer {VLAM_KEY_PREPAID}`. Without a key the SDK refuses the call, so set one even for a server that ignores it.
- A JSON body with `model` (`VLAM_MODEL`, default `vlam-llm-large-prepaid`), a `system` and a `user` message, `max_tokens: 4000` and `response_format: {"type": "json_object"}`. A 400 that mentions `response_format` is tried once more without it. No streaming; 30 seconds timeout and one retry.
- The answer has to hold one JSON object with the string fields `replacement` and `explanation` (for "Maak een opzet": `title`, `outline` and `explanation`). Text around the object is ignored; anything else shows "Onbruikbaar antwoord van VLAM".

For VLAM itself, put these in front of the preview command from the README:

```sh
VLAM_API_URL=<VLAM base address> VLAM_KEY_PREPAID=<prepaid key> VLAM_MODEL=vlam-llm-large-prepaid
```

Any other server that offers the OpenAI chat completions endpoint at that path works the same way. For a quick trial on your own machine, Ollama serves it at `http://localhost:11434/v1/chat/completions` and ignores the key. Pull a model and put the three variables in front of the preview command:

```sh
ollama pull llama3.2
VLAM_API_URL=http://localhost:11434 VLAM_KEY_PREPAID=ollama VLAM_MODEL=llama3.2
```

A small local model does not always keep to the JSON format; the panel then shows "Onbruikbaar antwoord van VLAM". Its answers say nothing about VLAM's quality.
