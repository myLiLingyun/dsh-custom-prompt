/**
 * dsh-custom-prompt — Host half.
 *
 * Adds a per-session "custom system prompt append" value to the assembled
 * system prompt. The value is edited from the Web composer and stored as the
 * `args` of a log-only `command/run` event, so it is reconstructable from the
 * session log, survives resume, and is inherited by forks without a separate
 * storage file.
 *
 * The command is human-only and only effective before the first turn of a new
 * session. Once `turn/start` is committed, later invocations are rejected and
 * the projection ignores them, so the request prefix (and its KV cache) stays
 * stable for the rest of the session.
 *
 * @module dsh-custom-prompt
 */

import z from '@deepseek-ai/schemastery';

/** Cordis plugin name. */
export const name = 'custom-system-prompt';

/**
 * Plugin configuration.
 *
 * `defaultText` is prefilled into the new-session addendum field on the
 * Client; the Host never appends it by itself, so an unapplied default leaves
 * the system prompt untouched. The field is `volatile()` so it is editable in
 * the Settings/Plugins UI and updates the running plugin in place instead of
 * restarting it.
 */
export const Config = z.object({
  defaultText: z
    .string()
    .description(
      'Prefilled in the addendum field of a new session; only applied after the user clicks Apply.',
    )
    .default('')
    .volatile(),
});

/** Services required by the Host half. */
export const inject = ['agents', 'commands', 'systemPrompt', 'sessionProjections'];

/** Human command that records the custom text. */
export const COMMAND_NAME = 'system-prompt';

/** Client-visible projection key carrying the custom text. */
export const PROJECTION_KEY = 'customSystemPrompt';

/** Prompt section name; unique across the prompt registry. */
export const SECTION_NAME = 'custom:system-prompt-append';

/** Section order placed after DEPLOYMENT_PERSONA_SUFFIX (10200). */
export const SECTION_ORDER = 10300;

/** Maximum number of characters accepted for one custom prompt. */
export const MAX_PROMPT_LENGTH = 20000;

/**
 * Projection state. `started` becomes true at the session's first
 * `turn/start` and permanently freezes `text`, matching the "new session only"
 * contract.
 */
const INITIAL_STATE = Object.freeze({ text: '', started: false });

/** State schema used by the projection registry's checkpoint path. */
const stateSchema = Object.freeze({
  parse(value) {
    if (
      value === null ||
      typeof value !== 'object' ||
      typeof value.text !== 'string' ||
      typeof value.started !== 'boolean'
    ) {
      throw new TypeError('custom system prompt state must be { text: string, started: boolean }');
    }
    return { text: value.text, started: value.started };
  },
});

/** Wire schema: the client only needs the text. */
const viewSchema = Object.freeze({
  parse(value) {
    if (typeof value !== 'string') {
      throw new TypeError('custom system prompt view must be a string');
    }
    return value;
  },
});

/**
 * Fold one committed session event into the custom prompt state.
 *
 * - `turn/start` freezes the addendum for the rest of the session.
 * - A matching `command/run` applies only while the session has not started.
 * - Multi-line command input is rejected: the slash command is a single-line
 *   entry point, so a following user message can never be swallowed into the
 *   system prompt.
 * - Over-long arguments are ignored so a manual invocation cannot inject an
 *   unbounded prompt after the command handler rejected it.
 *
 * @param {{ text: string, started: boolean }} state - current state.
 * @param {{ type?: string, data?: { name?: string, args?: string } }} event -
 *   committed session event.
 * @returns {{ text: string, started: boolean }} the next state, or the same
 *   reference when unchanged.
 */
export function foldCustomPrompt(state, event) {
  if (event?.type === 'turn/start') {
    return state.started ? state : { text: state.text, started: true };
  }
  if (event?.type !== 'command/run') return state;
  if (state.started) return state;
  const data = event.data;
  if (data?.name !== COMMAND_NAME) return state;
  const raw = typeof data.args === 'string' ? data.args : '';
  const text = raw.trim();
  if (text.includes('\n') || text.includes('\r')) return state;
  if (text.length > MAX_PROMPT_LENGTH) return state;
  return text === state.text ? state : { text, started: state.started };
}

/**
 * Read the custom text for one session.
 *
 * @param {object} sessionProjections - projection registry.
 * @param {object} session - session whose state is read.
 * @returns {string} the current addendum, or an empty string.
 */
function textFor(sessionProjections, session) {
  const state = sessionProjections.stateOf(session, PROJECTION_KEY);
  return state !== undefined && typeof state.text === 'string' ? state.text : '';
}

/**
 * Register the projection, prompt section, and human command.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - host context.
 */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.sessionProjections.register({
        key: PROJECTION_KEY,
        stateVersion: 2,
        stateSchema,
        init: () => INITIAL_STATE,
        apply: foldCustomPrompt,
        wire: {
          viewSchema,
          view: (state) => state.text,
        },
      }),
    'custom-system-prompt.projection',
  );

  ctx.effect(
    () =>
      ctx.systemPrompt.section({
        name: SECTION_NAME,
        order: SECTION_ORDER,
        interpolate: false,
        text: (context) => {
          const session = context.agent?.session;
          if (session === undefined) return '';
          return textFor(ctx.sessionProjections, session);
        },
      }),
    'custom-system-prompt.section',
  );

  // The command is armed per new Agent and removed at the first turn. Register
  // it through `agent.ctx` so the command registry sees the Agent scope: in an
  // existing session the command simply does not exist in the slash menu or
  // `commands.execute`.
  const armed = new Map();

  const commandDefinition = {
    name: COMMAND_NAME,
    description: "Set this new session's custom system-prompt addendum",
    input: { hint: '<single-line text to append; leave empty to clear>' },
    recordInput: true,
    handler: ({ agent, rawInput }) => {
      const text = rawInput.trim();
      if (text.includes('\n') || text.includes('\r')) {
        return {
          kind: 'error',
          text: 'Custom system prompt input must be a single line.',
        };
      }
      if (text.length > MAX_PROMPT_LENGTH) {
        return {
          kind: 'error',
          text: `Custom system prompt is too long (max ${MAX_PROMPT_LENGTH} characters).`,
        };
      }
      const state = ctx.sessionProjections.stateOf(agent.session, PROJECTION_KEY);
      if (state !== undefined && state.started) {
        return {
          kind: 'error',
          text: 'The custom system prompt can only be set before the first turn of a new session.',
        };
      }
      return { kind: 'success' };
    },
  };

  const disarm = (sessionId) => {
    const dispose = armed.get(sessionId);
    if (dispose === undefined) return;
    armed.delete(sessionId);
    dispose();
  };

  const arm = (agent) => {
    const session = agent.session;
    if (session.header.origin === 'subagent') return;
    if (armed.has(agent.id)) return;
    const state = ctx.sessionProjections.stateOf(session, PROJECTION_KEY);
    if (state !== undefined && state.started) return;
    const commands = agent.ctx.get('commands');
    if (commands === undefined) return;
    const dispose = agent.ctx.effect(
      () => commands.register(commandDefinition),
      'custom-system-prompt.command',
    );
    armed.set(agent.id, dispose);
  };

  ctx.on('agent/created', ({ agent }) => {
    arm(agent);
  });

  // A plugin reload can happen while a blank Agent is already live; arm it
  // too so the field keeps working without recreating the session.
  for (const agent of ctx.agents.list()) arm(agent);

  ctx.on('session/event', (session, event) => {
    if (event.type === 'turn/start') disarm(session.id);
  });

  ctx.on('agent/disposed', ({ agent }) => {
    disarm(agent.id);
  });

  ctx.effect(() => () => {
    for (const dispose of armed.values()) dispose();
    armed.clear();
  }, 'custom-system-prompt.commands');
}
