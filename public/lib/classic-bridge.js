// Same-origin bridge: credentials remain in the host page, never in the game frame or its save file.
export function installClassicBridge({
  getState,
  request,
  onProgress,
  onPreferences,
}) {
  let active = null;
  const frame = () => document.querySelector("iframe[data-classic-chat]");
  const send = (source, value) => source?.postMessage(value, location.origin);
  const refresh = () =>
    send(frame()?.contentWindow, {
      type: "UNSCAM_CLASSIC_CONFIG",
      ...getState(),
    });
  const cancel = () => {
    active?.controller.abort();
    active = null;
  };
  window.addEventListener("hashchange", cancel);
  window.addEventListener("message", async (event) => {
    if (
      event.origin !== location.origin ||
      event.source !== frame()?.contentWindow
    )
      return;
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "UNSCAM_CLASSIC_READY") {
      refresh();
      return;
    }
    if (data.type === "UNSCAM_CLASSIC_UPDATED") {
      onProgress(data.classic);
      return;
    }
    if (data.type === "UNSCAM_CLASSIC_PREFERENCES") {
      onPreferences({
        theme: data.theme === "dark" ? "dark" : "light",
        large: data.large === true,
      });
      return;
    }
    if (data.type === "UNSCAM_CLASSIC_CANCEL") {
      cancel();
      return;
    }
    if (data.type !== "UNSCAM_CLASSIC_CHAT") return;
    const source = event.source,
      id = data.id;
    const reply = (value) =>
      send(source, { type: "UNSCAM_CLASSIC_REPLY", id, ...value });
    if (!getState().enabled) {
      reply({ error: "请先在设置里启用 AI，基础剧情仍然可玩。" });
      return;
    }
    if (
      !Number.isSafeInteger(id) ||
      id < 1 ||
      !data.body ||
      typeof data.body !== "object" ||
      !/^classic:(?:[1-9]|1[0-6])$/.test(data.body.scenario) ||
      typeof data.body.message !== "string" ||
      data.body.message.length > 600
    ) {
      reply({ error: "场景请求无效" });
      return;
    }
    if (active) {
      reply({ error: "上一条回复仍在等待" });
      return;
    }
    const item = { controller: new AbortController(), source };
    active = item;
    const timer = setTimeout(() => item.controller.abort(), 25000);
    try {
      const result = await request(data.body, item.controller.signal);
      if (active === item) reply({ result });
    } catch (error) {
      if (active === item)
        reply({
          error: item.controller.signal.aborted
            ? "请求已取消或超时"
            : error.message || "模型暂不可用",
        });
    } finally {
      clearTimeout(timer);
      if (active === item) active = null;
    }
  });
  return { refresh, cancel };
}
