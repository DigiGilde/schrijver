# AI and VLAM

Transparency about the writing assistant ("Schrijfhulp") in Schrijver.

## What it does

- Suggests changes to a selection or a page: a shorter sentence, a B1 rewrite, a fixed action or a free prompt.
- Shows each suggestion as a word diff. The colleague chooses "Overnemen" or "Verwerpen".
- "Samenvatting" writes its suggestion only into the page's description field ("Gebruik als samenvatting"), never into the text.
- Never writes into a page by itself. Nothing reaches the forge unless the colleague takes the suggestion and then saves.

## What it does not do

- It makes no decisions about people and no automated decisions with legal or similar effect.
- It does not publish: a human editor still reviews and merges every proposal.
- It does not see who you are.

## What is sent

Sent to VLAM: the text being worked on (selection or page, up to 20 000 characters), the instruction (a fixed action or the free prompt, up to 1000 characters) and the site's writing guide (`schrijfwijzer`) as the system prompt.

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
