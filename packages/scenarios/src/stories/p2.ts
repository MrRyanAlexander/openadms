// P2 as the golden mission sets it up (spec/golden/MISSION.md §1, §3; ADR-368, 603), shared by
// the story `golden-mission` and the field app's browser world for the golden mission
// (`MissionWorld`): the PPDR project under P1's client and declaration event, Coastline its prime
// and its contract, a load form with Vegetative, an ROE form and a survey form, `VEG-HAUL-CY` at
// $9.00 and the rule that pays it, Marsh Road TDSR entered again; Rivera's self-loader certified
// on it, its own 730416; and Monday's board for Ana Brooks and Kim Nguyen on P2's phones. Nothing
// here moves the clock but the certification's own moment, as the caller tells it.
import {
  Certifications,
  ContractorSetup,
  FormSetup,
  PayItemSetup,
  ProjectSetup,
  SiteSetup,
} from '@open-adms/api';
import { uuidv7 } from '@open-adms/domain';

import { utcOffsetMinutes } from '../clock.ts';
import type { StoryContext } from '../runner.ts';
import { assigned } from './board.ts';
import { photographed, primaryBox, saved, unticked, type P1Office } from './p1-office.ts';
import { p1TimeZone as timeZone } from './p1.ts';

// P2's two phones (golden mission §1): a second phone each for Ana and Kim, one project a phone.
export const p2Phones = ['P2-COL-1', 'P2-TWR-TDSR'] as const;
export type P2PhoneName = (typeof p2Phones)[number];

export interface P2 {
  readonly p2: string;
  readonly load: string;
  readonly vegetative: string;
  readonly haul: string;
  readonly tdsr: string;
}

// Dana sets P2 up, now by the story's clock, through the setup services.
export async function setUpP2(
  story: StoryContext,
  office: Pick<P1Office, 'dana' | 'p1' | 'coastline'>,
): Promise<P2> {
  const { api, clock, policy } = story;
  const { dana, coastline } = office;
  const projects = new ProjectSetup(api, clock, policy);
  const contractors = new ContractorSetup(api, clock, policy);
  const forms = new FormSetup(api, clock, policy);
  const payItems = new PayItemSetup(api, clock, policy);
  const first = await api.project.findUniqueOrThrow({ where: { id: office.p1 } });
  const p2 = (
    await saved(
      projects.project(dana, {
        name: 'Bayline County PPDR, Hurricane Delphine',
        clientId: first.clientId,
        declarationEventId: first.declarationEventId,
        programTypeId: (await api.programType.findFirstOrThrow({ where: { name: 'PPDR' } })).id,
        timeZone,
        activeFrom: '2026-10-12',
        activeTo: '2027-01-31',
        ticketNumberSource: 'GENERATED',
        workflows: ['LOAD'],
        kindOfWorkIds: [],
        numbersFrom: { LOAD: 102001, CERTIFICATION: 730416 },
      }),
    )
  ).id;
  await saved(contractors.addPrime(dana, p2, coastline));
  await saved(
    contractors.contract(dana, {
      projectId: p2,
      name: 'Coastline, Bayline PPDR 2026',
      primeId: coastline,
    }),
  );
  const load = (
    await saved(forms.form(dana, { projectId: p2, documentType: 'LOAD', name: 'Load' }))
  ).id;
  await saved(
    forms.form(dana, {
      projectId: p2,
      documentType: 'ROE',
      name: 'ROE',
      gpsRequired: false,
    }),
  );
  await saved(forms.form(dana, { projectId: p2, documentType: 'SURVEY', name: 'Survey' }));
  const vegetative = (
    await saved(
      forms.debrisType(dana, {
        formId: load,
        debrisTypeId: (await api.debrisType.findFirstOrThrow({ where: { name: 'Vegetative' } })).id,
        reduced: false,
        hiddenOnPhones: false,
      }),
    )
  ).id;
  const haul = (
    await saved(
      payItems.payItem(dana, {
        ...unticked,
        projectId: p2,
        code: 'VEG-HAUL-CY',
        description: 'PPDR VEG haul',
        payableTypeId: (await api.payableType.findFirstOrThrow({ where: { name: 'Vegetative' } }))
          .id,
        unit: 'CY',
        rates: [{ primeId: coastline, rate: '9.00' }],
      }),
    )
  ).id;
  await saved(
    payItems.paysWhen(dana, haul, [
      {
        formId: load,
        slot: 1,
        criteria: [{ criterion: 'DEBRIS_TYPE', operator: 'EQUALS', picks: [vegetative] }],
      },
    ]),
  );
  const tdsr = (
    await saved(
      new SiteSetup(api, clock, policy).site(dana, {
        projectId: p2,
        name: 'Marsh Road TDSR',
        siteTypeId: (await api.siteType.findUniqueOrThrow({ where: { key: 'TDSR' } })).id,
        takesLoads: true,
        haulOutsLeaveHere: true,
        chargesTippingFee: false,
        ineligibleSite: false,
        permitNumber: 'FDEP-DMS-2026-0117',
        latitude: '39.09000000',
        longitude: '-75.62000000',
        activationDate: '2026-10-12',
      }),
    )
  ).id;
  return { p2, load, vegetative, haul, tdsr };
}

// Saturday at 11:30: Sam Grant certifies Rivera's self-loader on P2, its own 730416, and its five
// photographs go from the phone he certifies on. The certification as saved.
export async function certifyP2Loader(
  story: StoryContext,
  office: Pick<P1Office, 'sam' | 'coastline' | 'samPhone'>,
  p2: Pick<P2, 'p2'>,
) {
  const { api, clock } = story;
  clock.set('2026-10-10T11:30:00-04:00');
  const feature = async (name: string): Promise<string> =>
    (await api.vehicleFeature.findFirstOrThrow({ where: { name } })).id;
  const loader = await saved(
    new Certifications(api, clock, story.policy).certify({
      id: uuidv7(clock.now()),
      projectId: p2.p2,
      kind: 'CONTAINER',
      certNumber: '730416',
      primeId: office.coastline,
      firstTierSub: 'Rivera Trucking',
      vehicleTypeId: (
        await api.vehicleType.findFirstOrThrow({ where: { name: 'Self-Loading Truck' } })
      ).id,
      boxes: [
        primaryBox(264, 92, 96),
        {
          shape: 'TRIANGLE',
          sign: 'SUBTRACT',
          length: 36,
          width: 92,
          height: 48,
          featureId: await feature('Dog Box'),
        },
      ],
      certifiedById: office.sam,
      certifiedAt: clock.now(),
      deviceUtcOffsetMinutes: utcOffsetMinutes(timeZone, clock.now()),
    }),
  );
  await photographed(story, { deviceId: office.samPhone, takenById: office.sam }, loader);
  return loader;
}

// Monday's board on P2, now by the story's clock: Ana on its collections, ROEs and surveys, Kim on
// its disposals at its Marsh Road TDSR, each naming their P2 phone. Each assignment's id.
export async function boardP2(
  story: StoryContext,
  who: { readonly luis: string; readonly ana: string; readonly kim: string },
  p2: Pick<P2, 'p2' | 'tdsr'>,
  phones: Readonly<Record<P2PhoneName, string>>,
): Promise<{ readonly ana: string; readonly kim: string }> {
  const monday = { workDate: '2026-10-12', projectId: p2.p2 } as const;
  return {
    ana: await assigned(story.api, story.clock, who.luis, {
      ...monday,
      personId: who.ana,
      deviceId: phones['P2-COL-1'],
      fieldEventKinds: ['COLLECTION'],
      formDocumentTypes: ['ROE', 'SURVEY'],
    }),
    kim: await assigned(story.api, story.clock, who.luis, {
      ...monday,
      personId: who.kim,
      deviceId: phones['P2-TWR-TDSR'],
      fieldEventKinds: ['DISPOSAL'],
      siteId: p2.tdsr,
    }),
  };
}
