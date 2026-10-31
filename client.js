/**
 * dsh-custom-prompt — browser half.
 *
 * Renders a compact "system prompt addendum" field below the composer while a
 * Session is still blank. Applying the field executes the Host's
 * `/system-prompt` human command, whose log-only `command/run` event is the
 * durable record read back by the `customSystemPrompt` projection.
 *
 * The Host's volatile `defaultText` Config is served by the Settings service.
 * This half reads it through `ctx.configForms` and prefills the addendum field
 * of a new (blank) Session with it. Prefilling is the whole effect: unless the
 * user clicks Apply, no addendum is recorded and the system prompt is
 * unchanged. The same Config is edited from the Plugins page's bundle
 * configuration section (`plugins.bundle.config`).
 */

window.__ModuleLoader__.load({
  id: 'dsh-custom-prompt',
  factory(require) {
    'use strict';

    var React = require('react');
    var h = React.createElement;

    /** Locale namespace owned by this plugin. */
    var NS = 'customPrompt';
    /** Must stay in sync with the Host command in index.js. */
    var COMMAND_NAME = 'system-prompt';
    /** Must stay in sync with the Host projection key in index.js. */
    var PROJECTION_KEY = 'customSystemPrompt';
    /** Must stay in sync with the Host limit in index.js. */
    var MAX_PROMPT_LENGTH = 20000;
    /** Loader entry id that owns the Host Config (`custom-system-prompt` row). */
    var SETTINGS_NS = 'custom-system-prompt';
    /** Bundle package name; keys this bundle's `plugins.bundle.config` entry. */
    var BUNDLE_NAME = 'dsh-custom-prompt';

    var ZH = {
      label: '系统提示词追加',
      placeholder: '例如：你需要读取 ~/AI-note/general.md',
      hint: 'Enter 应用',
      apply: '应用',
      applying: '应用中…',
      clear: '清除',
      applied: '已应用',
      unsaved: '未应用',
      failed: '应用失败',
      commandUnavailable: '命令服务不可用',
      tooLong: '最多 20000 个字符',
      configTitle: '默认追加文本',
      configHint:
        '新建对话时，这段文字会预先填入输入框；只有点击“应用”才会追加到系统提示词，不点击则不追加。',
      configPlaceholder: '例如：你需要读取 ~/AI-note/general.md',
      configSave: '保存',
      configSaving: '保存中…',
      configReset: '恢复默认',
      configOverridden: '已覆盖',
      configLoading: '读取配置中…',
      configUnavailable: '当前部署无法读写该配置。',
      configSaveFailed: '保存失败，请重试。',
    };

    var EN = {
      label: 'System prompt addendum',
      placeholder: 'e.g. Read ~/AI-note/general.md',
      hint: 'Enter to apply',
      apply: 'Apply',
      applying: 'Applying…',
      clear: 'Clear',
      applied: 'Applied',
      unsaved: 'Not applied',
      failed: 'Could not apply',
      commandUnavailable: 'Command service unavailable',
      tooLong: 'Maximum 20000 characters',
      configTitle: 'Default addendum text',
      configHint:
        'New sessions start with this text prefilled below the composer. It is appended only after you click Apply; leaving it unapplied appends nothing.',
      configPlaceholder: 'e.g. Read ~/AI-note/general.md',
      configSave: 'Save',
      configSaving: 'Saving…',
      configReset: 'Reset to default',
      configOverridden: 'Overridden',
      configLoading: 'Reading configuration…',
      configUnavailable: 'This deployment cannot read or write this configuration.',
      configSaveFailed: 'Could not save. Try again.',
    };

    var CSS = [
      '.dsh-custom-prompt-root{order:2;flex:0 0 auto;align-self:center;width:100%;max-width:var(--dsh-composer-card-max-width);box-sizing:border-box;margin:0;padding:7px 9px;border:0.5px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;display:flex;flex-direction:column;gap:3px}',
      '.dsh-custom-prompt-row{display:flex;align-items:center;gap:8px;min-width:0}',
      '.dsh-custom-prompt-label{flex:none;color:var(--dsw-alias-label-secondary);font-weight:500;white-space:nowrap}',
      '.dsh-custom-prompt-input{flex:1;min-width:0;box-sizing:border-box;height:22px;margin:0;padding:1px 2px;border:0;outline:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;line-height:20px}',
      '.dsh-custom-prompt-input::placeholder{color:var(--dsw-alias-label-secondary);opacity:.72}',
      '.dsh-custom-prompt-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;border-radius:4px}',
      '.dsh-custom-prompt-apply{flex:none;box-sizing:border-box;margin:0;padding:1px 10px;border:0.5px solid var(--dsw-alias-border-l1);border-radius:999px;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-weight:500;line-height:20px;cursor:pointer}',
      '.dsh-custom-prompt-apply:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-custom-prompt-apply:disabled{opacity:.55;cursor:default}',
      '.dsh-custom-prompt-apply:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-custom-prompt-foot{display:flex;align-items:center;gap:8px;min-width:0;padding-left:2px}',
      '.dsh-custom-prompt-hint{min-width:0;color:var(--dsw-alias-label-secondary);opacity:.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-custom-prompt-status{flex:none;color:var(--dsw-alias-state-success-primary)}',
      '.dsh-custom-prompt-status[data-dirty="true"]{color:var(--dsw-alias-state-warn-primary)}',
      '.dsh-custom-prompt-clear{flex:none;margin:0;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;text-decoration:underline;cursor:pointer}',
      '.dsh-custom-prompt-clear:hover:not(:disabled){color:var(--dsw-alias-label-primary)}',
      '.dsh-custom-prompt-clear:disabled{opacity:.55;cursor:default}',
      '.dsh-custom-prompt-error{color:var(--dsw-alias-state-error-primary)}',
      '.dsh-custom-prompt-config{display:flex;flex-direction:column;gap:8px;max-width:560px;color:var(--dsw-alias-label-primary)}',
      '.dsh-custom-prompt-config-label{font-weight:600;font-size:13px;line-height:20px}',
      '.dsh-custom-prompt-config-input{box-sizing:border-box;width:100%;height:32px;margin:0;padding:0 10px;border:0.5px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}',
      '.dsh-custom-prompt-config-input::placeholder{color:var(--dsw-alias-label-secondary);opacity:.72}',
      '.dsh-custom-prompt-config-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-custom-prompt-config-input:disabled{opacity:.6}',
      '.dsh-custom-prompt-config-hint{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
      '.dsh-custom-prompt-config-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.dsh-custom-prompt-config-save{box-sizing:border-box;margin:0;padding:2px 14px;border:0.5px solid var(--dsw-alias-brand-primary);border-radius:999px;background:var(--dsw-alias-brand-primary);color:#fff;font:inherit;font-weight:500;line-height:20px;cursor:pointer}',
      '.dsh-custom-prompt-config-save:disabled{opacity:.55;cursor:default}',
      '.dsh-custom-prompt-config-save:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.dsh-custom-prompt-config-reset{box-sizing:border-box;margin:0;padding:2px 12px;border:0.5px solid var(--dsw-alias-border-l1);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;line-height:20px;cursor:pointer}',
      '.dsh-custom-prompt-config-reset:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-custom-prompt-config-reset:disabled{opacity:.55;cursor:default}',
      '.dsh-custom-prompt-config-status{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.dsh-custom-prompt-config-error{margin:0;color:var(--dsw-alias-state-error-primary);font-size:12px}',
    ].join('');

    /** A snapshot used before the Settings service answers. */
    var EMPTY_SNAPSHOT = {
      status: 'unavailable',
      value: undefined,
      user: undefined,
      revision: undefined,
      writable: false,
    };

    /**
     * Make a Config value safe for the single-line addendum field.
     * @param {unknown} value - raw `defaultText` value.
     * @returns {string} trimmed single-line text within the Host limit.
     */
    function normalizeDefaultText(value) {
      var text = typeof value === 'string' ? value.replace(/[\r\n]+/g, ' ').trim() : '';
      return text.length > MAX_PROMPT_LENGTH ? text.slice(0, MAX_PROMPT_LENGTH) : text;
    }

    /**
     * Read the configured default text out of a settings form snapshot.
     * @param {object | undefined} snapshot - `ConfigFormSnapshot`.
     * @returns {string} the normalized default text, or an empty string.
     */
    function defaultTextOf(snapshot) {
      if (!snapshot || snapshot.status !== 'ready') return '';
      var section = snapshot.value;
      return section !== null && typeof section === 'object'
        ? normalizeDefaultText(section.defaultText)
        : '';
    }

    /**
     * Whether the user layer overrides `defaultText`.
     * @param {object | undefined} snapshot - `ConfigFormSnapshot`.
     * @returns {boolean} true when the field is explicitly set.
     */
    function isOverridden(snapshot) {
      var section = snapshot ? snapshot.user : undefined;
      return (
        section !== null &&
        typeof section === 'object' &&
        Object.prototype.hasOwnProperty.call(section, 'defaultText')
      );
    }

    /**
     * One observable over the Settings form of this plugin's Host entry.
     *
     * The form is attached only once `configForms` is available, which can
     * happen after the addendum field mounted; the source keeps its own
     * listeners so a late attachment still re-renders subscribers.
     * @returns {object} subscribe/getSnapshot plus attach/detach.
     */
    function createSettingsSource() {
      var card = null;
      var off = null;
      var snapshot = EMPTY_SNAPSHOT;
      var listeners = [];

      var source = {
        subscribe: function (listener) {
          listeners.push(listener);
          return function () {
            var index = listeners.indexOf(listener);
            if (index >= 0) listeners.splice(index, 1);
          };
        },
        getSnapshot: function () {
          return snapshot;
        },
        refresh: function () {
          var next = card === null ? EMPTY_SNAPSHOT : card.getSnapshot();
          if (next === snapshot) return;
          snapshot = next;
          var current = listeners.slice();
          for (var index = 0; index < current.length; index += 1) current[index]();
        },
        attach: function (next) {
          if (off !== null) {
            off();
            off = null;
          }
          card = next;
          if (next !== null) off = next.subscribe(source.refresh);
          source.refresh();
        },
        detach: function () {
          source.attach(null);
        },
        card: function () {
          return card;
        },
      };
      return source;
    }

    /**
     * Narrow a `ConfigForm` to the snapshot/actions this plugin uses.
     * @param {object} form - the `custom-system-prompt` settings form.
     * @returns {object} subscription, snapshot, and write operations.
     */
    function createSettingsCard(form) {
      return {
        subscribe: form.subscribe.bind(form),
        getSnapshot: form.getSnapshot.bind(form),
        save: function (text, revision) {
          return form.mutate([{ op: 'set', path: ['defaultText'], value: text }], revision);
        },
        reset: function (revision) {
          return form.mutate([{ op: 'unset', path: ['defaultText'] }], revision);
        },
      };
    }

    return {
      name: 'dsh-custom-prompt',
      inject: ['slots', 'locale', 'remote', 'remote.commands'],
      apply: function (ctx) {
        ctx.effect(function () {
          return ctx.locale.register(NS, { zh: ZH, en: EN });
        }, 'custom-system-prompt: dictionaries');

        var commands = ctx.remote.commands;
        var settings = createSettingsSource();

        /**
         * Ambient field below the composer. It is deliberately blank-session
         * only: the addendum is a creation-time decision, while the slash
         * command remains available for later edits.
         *
         * A configured default is only a draft prefill. `touched` keeps the
         * effect below from refilling a field the user cleared or edited while
         * the Settings mirror catches up.
         * @param {object} props - slot standard props plus the locale `t`.
         * @returns {object | null} the field while the Session is blank.
         */
        function CustomPromptDock(props) {
          var t = typeof props.t === 'function' ? props.t : function (key) { return key; };
          var sessionId = props.sessionId;
          var useSession = props.useSession;
          var useProjection = props.useProjection;

          var blank = useSession(function (session) {
            return session !== undefined && session.blank === true;
          });
          var projected = useProjection(PROJECTION_KEY);
          var stored = typeof projected === 'string' ? projected : '';
          var settingsSnapshot = React.useSyncExternalStore(
            settings.subscribe,
            settings.getSnapshot,
          );
          var defaultText = defaultTextOf(settingsSnapshot);

          var draftState = React.useState(stored === '' ? defaultText : stored);
          var draft = draftState[0];
          var setDraft = draftState[1];
          var errorState = React.useState(null);
          var error = errorState[0];
          var setError = errorState[1];
          var busyState = React.useState(false);
          var busy = busyState[0];
          var setBusy = busyState[1];
          var focused = React.useRef(false);
          var touched = React.useRef(stored !== '');
          var lastSession = React.useRef(sessionId);
          var lastStored = React.useRef(stored);
          var lastDefault = React.useRef(defaultText);

          React.useEffect(function () {
            if (lastSession.current !== sessionId) {
              lastSession.current = sessionId;
              touched.current = false;
              setDraft(stored === '' ? defaultText : stored);
              setError(null);
              setBusy(false);
              return;
            }
            // Follow applied-text and Settings changes only while the value the
            // field shows is still the one the plugin put there.
            var pluginValue = lastStored.current === '' ? lastDefault.current : lastStored.current;
            if (!focused.current && !touched.current && draft === pluginValue) {
              setDraft(stored === '' ? defaultText : stored);
            }
            lastStored.current = stored;
            lastDefault.current = defaultText;
          }, [sessionId, stored, defaultText, draft]);

          var applyValue = React.useCallback(
            function (value) {
              var text = value.trim();
              if (text.length > MAX_PROMPT_LENGTH) {
                setError(t('tooLong'));
                return;
              }
              if (commands === undefined || commands === null) {
                setError(t('commandUnavailable'));
                return;
              }
              if (sessionId === undefined) {
                setError(t('commandUnavailable'));
                return;
              }
              setBusy(true);
              setError(null);
              var line = text.length === 0 ? '/' + COMMAND_NAME : '/' + COMMAND_NAME + ' ' + text;
              Promise.resolve()
                .then(function () {
                  return commands.execute(sessionId, line, []);
                })
                .then(function (result) {
                  if (!result || result.ok !== true) {
                    var failure = result && result.error;
                    var detail = failure && (failure.message || failure.code);
                    throw new Error(detail || t('failed'));
                  }
                  if (result.value === undefined) throw new Error(t('commandUnavailable'));
                  if (result.value.result && result.value.result.kind === 'error') {
                    throw new Error(result.value.result.text || t('failed'));
                  }
                })
                .catch(function (failure) {
                  setError(failure && failure.message ? failure.message : t('failed'));
                })
                .finally(function () {
                  setBusy(false);
                });
            },
            [commands, sessionId, t],
          );

          if (blank !== true) return null;

          var dirty = draft.trim() !== stored.trim();
          var canApply = !busy && dirty;

          return h(
            'div',
            {
              className: 'dsh-custom-prompt-root',
              'data-dirty': dirty ? 'true' : undefined,
            },
            h('style', null, CSS),
            h(
              'div',
              { className: 'dsh-custom-prompt-row' },
              h('span', { className: 'dsh-custom-prompt-label' }, t('label')),
              h('input', {
                className: 'dsh-custom-prompt-input',
                type: 'text',
                value: draft,
                maxLength: MAX_PROMPT_LENGTH,
                placeholder: t('placeholder'),
                spellCheck: false,
                'aria-label': t('label'),
                onFocus: function () {
                  focused.current = true;
                },
                onBlur: function () {
                  focused.current = false;
                },
                onChange: function (event) {
                  touched.current = true;
                  setDraft(event.target.value);
                  if (error !== null) setError(null);
                },
                onKeyDown: function (event) {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    if (!busy && draft.trim() !== stored.trim()) applyValue(draft);
                  }
                },
              }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-custom-prompt-apply',
                  disabled: !canApply,
                  onClick: function () {
                    applyValue(draft);
                  },
                },
                busy ? t('applying') : t('apply'),
              ),
            ),
            h(
              'div',
              { className: 'dsh-custom-prompt-foot' },
              h('span', { className: 'dsh-custom-prompt-hint' }, t('hint')),
              stored.length > 0
                ? h(
                    'span',
                    {
                      className: 'dsh-custom-prompt-status',
                      'data-dirty': dirty ? 'true' : undefined,
                    },
                    dirty ? t('unsaved') : t('applied'),
                  )
                : null,
              stored.length > 0
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-custom-prompt-clear',
                      disabled: busy,
                      onClick: function () {
                        touched.current = true;
                        setDraft('');
                        applyValue('');
                      },
                    },
                    t('clear'),
                  )
                : null,
            ),
            error === null ? null : h('div', { className: 'dsh-custom-prompt-error', role: 'alert' }, error),
          );
        }

        /**
         * Bundle configuration page: edits the Host entry's volatile
         * `defaultText`. The Plugins page renders this through
         * `plugins.bundle.config` for this bundle.
         * @param {object} props - slot props plus the locale `t`.
         * @returns {object} the configuration form.
         */
        function ConfigPanel(props) {
          var t = typeof props.t === 'function' ? props.t : function (key) { return key; };
          var snapshot = React.useSyncExternalStore(
            settings.subscribe,
            settings.getSnapshot,
          );
          var accepted = defaultTextOf(snapshot);
          var editingState = React.useState(null);
          var editing = editingState[0];
          var setEditing = editingState[1];
          var errorState = React.useState(null);
          var error = errorState[0];
          var setError = errorState[1];
          var busyState = React.useState(false);
          var busy = busyState[0];
          var setBusy = busyState[1];
          var inputId = React.useId();

          var text = editing === null ? accepted : editing;
          var ready = snapshot.status === 'ready';
          var writable = ready && snapshot.writable === true;
          var overridden = isOverridden(snapshot);
          var dirty = text.trim() !== accepted.trim();
          var card = settings.card();

          function run(operation) {
            if (card === null || !writable || busy) return;
            setBusy(true);
            setError(null);
            Promise.resolve()
              .then(operation)
              .then(function (ok) {
                if (ok === true) {
                  setEditing(null);
                  return;
                }
                setError(t('configSaveFailed'));
              })
              .catch(function (failure) {
                setError(
                  failure && failure.message ? failure.message : t('configSaveFailed'),
                );
              })
              .finally(function () {
                setBusy(false);
              });
          }

          /** Persist the current draft; an empty draft restores the schema default. */
          function commit() {
            var value = text.trim();
            run(function () {
              return value === ''
                ? card.reset(snapshot.revision)
                : card.save(value, snapshot.revision);
            });
          }

          if (!ready) {
            return h(
              'div',
              { className: 'dsh-custom-prompt-config' },
              h('style', null, CSS),
              h(
                'p',
                { className: 'dsh-custom-prompt-config-status', role: 'status' },
                snapshot.status === 'loading' ? t('configLoading') : t('configUnavailable'),
              ),
            );
          }

          return h(
            'div',
            { className: 'dsh-custom-prompt-config' },
            h('style', null, CSS),
            h(
              'label',
              { className: 'dsh-custom-prompt-config-label', htmlFor: inputId },
              t('configTitle'),
            ),
            h('input', {
              id: inputId,
              className: 'dsh-custom-prompt-config-input',
              type: 'text',
              value: text,
              maxLength: MAX_PROMPT_LENGTH,
              placeholder: t('configPlaceholder'),
              spellCheck: false,
              disabled: !writable || busy,
              onChange: function (event) {
                setEditing(event.target.value);
                if (error !== null) setError(null);
              },
              onKeyDown: function (event) {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                if (!dirty || busy || !writable) return;
                commit();
              },
            }),
            h('p', { className: 'dsh-custom-prompt-config-hint' }, t('configHint')),
            h(
              'div',
              { className: 'dsh-custom-prompt-config-actions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-custom-prompt-config-save',
                  disabled: !writable || busy || !dirty,
                  onClick: function () {
                    commit();
                  },
                },
                busy ? t('configSaving') : t('configSave'),
              ),
              overridden
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-custom-prompt-config-reset',
                      disabled: !writable || busy,
                      onClick: function () {
                        run(function () {
                          return card.reset(snapshot.revision);
                        });
                      },
                    },
                    t('configReset'),
                  )
                : null,
              overridden
                ? h('span', { className: 'dsh-custom-prompt-config-status' }, t('configOverridden'))
                : null,
              writable
                ? null
                : h(
                    'span',
                    { className: 'dsh-custom-prompt-config-status' },
                    t('configUnavailable'),
                  ),
            ),
            error === null
              ? null
              : h('p', { className: 'dsh-custom-prompt-config-error', role: 'alert' }, error),
          );
        }

        // The Settings form of this plugin's Host entry is owned by the
        // Settings service; attach it when that service appears so the
        // addendum field can prefill the configured default text.
        ctx.inject(['configForms'], function (child) {
          var form = child.configForms.get(SETTINGS_NS);
          settings.attach(createSettingsCard(form));
          child.effect(function () {
            return function () {
              settings.detach();
            };
          }, 'custom-system-prompt: settings source');
          child.effect(function () {
            return child.slots.inject('plugins.bundle.config', function () {
              return child.slots.register(
                {
                  name: 'plugins.bundle.config',
                  key: BUNDLE_NAME,
                  locale: NS,
                },
                ConfigPanel,
              );
            });
          }, 'custom-system-prompt: settings panel');
        });

        // The Host renders `conversation.input.dock` above the composer card.
        // The root's CSS `order: 2` moves it below the card inside the column
        // composer stack, which is the only slot position that also exists in
        // the blank-session Hero (the resident `composer.dock` does not render
        // there).
        ctx.slots.inject('conversation.input.dock', function () {
          return ctx.slots.register(
            {
              name: 'conversation.input.dock',
              id: 'custom-system-prompt',
              order: 10,
              locale: NS,
            },
            CustomPromptDock,
          );
        });
      },
    };
  },
});
