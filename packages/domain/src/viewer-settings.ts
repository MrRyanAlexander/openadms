// What a read-only viewer's record says beyond their kind and projects (spec/DATA-MODEL.md §2.2;
// spec/acceptance/02-people-and-devices.md AC-02-75; ADR-328, 336). The firm makes each choice
// for each viewer when it adds them, and changes it at any time; the database holds none of the
// starting values, so whoever adds a viewer starts from here.
export class ViewerSettings {
  // Whether they see private citizens by name: an ROE's owner, a drop-off log's resident and
  // where their debris came from.
  readonly seesPrivateCitizens: boolean;

  constructor(seesPrivateCitizens: boolean) {
    this.seesPrivateCitizens = seesPrivateCitizens;
  }

  // A new viewer sees private citizens by name until the firm says otherwise (ADR-328 (4)).
  static starting(): ViewerSettings {
    return new ViewerSettings(true);
  }
}
