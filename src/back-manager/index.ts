import UssdNavigator from "@/ussd-navigator";

export class BackNavigationManager<T> {
  private navigator: UssdNavigator<T>;
  private maxHistorySize: number = 5;

  constructor(navigator: UssdNavigator<T>, maxHistorySize: number = 5) {
    this.navigator = navigator;
    this.maxHistorySize = maxHistorySize;
  }

  async pushToHistory(menuName: string): Promise<void> {
    const session = (await this.navigator.getSession()) || {};
    const history = [...(session?.navigationHistory || [])];

    if (history[history.length - 1] !== menuName) {
      history.push(menuName);

      if (history.length > this.maxHistorySize) {
        history.shift();
      }

      session.navigationHistory = history;
      await this.navigator.setSession(session);
    }
  }

  async goBack(): Promise<string> {
    const session = (await this.navigator.getSession()) || {};
    const history = [...(session?.navigationHistory || [])];

    if (history.length <= 1) {
      return this.navigator.start_menu;
    }

    history.pop();
    const previousMenu =
      history[history.length - 1] || this.navigator.start_menu;

    session.navigationHistory = history;
    await this.navigator.setSession(session);

    return previousMenu;
  }

  async clearHistory(): Promise<void> {
    const session = (await this.navigator.getSession()) || {};
    session.navigationHistory = [];
    await this.navigator.setSession(session);
  }
}
