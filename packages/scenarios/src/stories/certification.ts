// The fourth story (BACKLOG 1.2.3; ADR-321): certifying P1's trucks and crews, through the API's
// certification service (spec/parts/03-certification.md; spec/golden/MISSION.md §1). On Saturday
// 10 October 2026, two days before the work starts, Sam Grant certifies on the phone P1-HO-TDSR,
// under an assignment that includes certifying, with Lee Morgan helping. Nobody types a capacity:
// each container's is what its measured boxes work out to (spec/CONVENTIONS.md §6: 65, 48 and 110
// CY). Nobody set up a sub: Rivera Trucking appears on P1 only when Sam types it in on its truck
// (AC-01-19, AC-03-11), and Tidewater Hauling under it (AC-03-12).
//
// Then what happens later: a measuring mistake corrected in place, the capacity worked out again
// (AC-03-51); a modified truck certified again, replacing its old certification; a revocation;
// and two spellings of one sub, never merged (ADR-529 (f)). Along the way the service
// refuses only what can't be a certification (measurements that give no capacity, a crew with
// boxes, a tier 2 sub with no tier 1, a revocation with no reason), saving nothing.
//
// Not here: the phone's screens and its sub suggestions (Phase 3); the phone's cert-number block
// (the story `numbering`: the numbers Sam's phone gives out are stated here), photographs
// (Milestone 1.3), the flags a certification raises on tickets (1.5.5) and QC (1.8.2).
import { createHash } from 'node:crypto';

import {
  type BoxInput,
  Certifications,
  ContractorSetup,
  type NewCertification,
  type Outcome,
} from '@open-adms/api';
import {
  correctCertificationBoxEndpoint,
  revokeCertificationEndpoint,
  setPermissionsEndpoint,
} from '@open-adms/contracts';
import { NewProjectSettings, SubNames, uuidv7 } from '@open-adms/domain';

import { utcOffsetMinutes } from '../clock.ts';
import { refusalOf } from '../over-https.ts';
import type { Story } from '../runner.ts';
import { assigned, taken } from './board.ts';
import { danasEmail, luissEmail, p1TimeZone as timeZone, setUpP1, startSeries } from './p1.ts';

const on = (date: string, time: string): string => `2026-10-${date}T${time}:00-04:00`;
const saturday = (time: string): string => on('10', time);

// The primary box, and the shapes a box after it takes.
const primary = (length: number, width: number, height: number): BoxInput => ({
  shape: 'RECTANGLE',
  sign: 'ADD',
  length,
  width,
  height,
});

export const certification: Story = {
  name: 'certification',
  title:
    'Sam Grant certifies P1’s trucks and crews; a sub is typed in; a measurement is corrected; a truck is replaced and revoked',
  timeZone,
  start: saturday('08:00'),

  async run(story) {
    const { api, clock } = story;
    const certifications = new Certifications(api, clock, story.policy);
    const contractors = new ContractorSetup(api, clock, story.policy);

    const saved = async <T>(attempt: Promise<Outcome<T>>): Promise<T> => {
      const outcome = await attempt;
      if (!outcome.saved) throw new Error(`Refused: ${outcome.refusal.message}`);
      return outcome.record;
    };
    const warned = async <T>(attempt: Promise<Outcome<T>>): Promise<string[]> => {
      const outcome = await attempt;
      if (!outcome.saved) throw new Error(`Refused: ${outcome.refusal.message}`);
      return outcome.warnings.map((warning) => warning.code);
    };
    const refused = async <T>(attempt: Promise<Outcome<T>>): Promise<string> => {
      const outcome = await attempt;
      return outcome.saved ? 'saved' : `${outcome.refusal.code}: ${outcome.refusal.message}`;
    };

    // ------------------------------------------------------------------------------------------
    story.at(
      saturday('08:00'),
      'The back office has set up P1 and P2 with their primes; Sam Grant is assigned to certify on P1 today, Lee Morgan with him',
    );
    // Sam's phone, enrolled under the master passcode with a key of its own (ADR-439, 440).
    const phone = await story.enrolled('P1-HO-TDSR');
    const dana = uuidv7(clock.now());
    const world = await api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
      await tx.user.create({
        data: { id: dana, name: 'Dana Reyes', role: 'ADMIN', email: danasEmail },
      });
      const luis = await tx.user.create({
        data: { name: 'Luis Ortega', role: 'MANAGER_ANALYST', email: luissEmail },
      });
      const p1 = await setUpP1(tx, story.policy);
      const ppdr = await tx.programType.findFirstOrThrow({ where: { name: 'PPDR' } });
      const p2 = await tx.project.create({
        data: {
          name: 'Bayline County PPDR, Hurricane Delphine',
          clientId: p1.client,
          declarationEventId: p1.declarationEvent,
          programTypeId: ppdr.id,
          timeZone,
          activeFrom: new Date('2026-10-12'),
          activeTo: new Date('2027-01-31'),
          ticketNumberSource: 'GENERATED',
          workflows: ['LOAD'],
          ...new NewProjectSettings(story.policy).for(ppdr),
        },
      });
      // P2's own series; its cert numbers are seeded at 880112.
      await startSeries(tx, p2.id, { LOAD: 102001, CERTIFICATION: 880112 });
      return {
        luis: luis.id,
        p1: p1.project,
        p2: p2.id,
        coastline: p1.prime,
        phone: phone.id,
      };
    });
    const { luis, p1, p2, coastline } = world;
    // Dana and Luis at their browsers (BACKLOG 2.7.1 part 4; ADR-496, 502), each signed in when
    // first asked for: she is the firm's first admin, and sets his first password herself.
    const danas = () => story.backOffice.admin({ id: dana, email: danasEmail });
    const luiss = async () =>
      story.backOffice.person(await danas(), { id: luis, email: luissEmail });
    // Created as real ones are: on the phone, online, under the master passcode (ADR-442).
    const samGrant = await story.monitor('Sam Grant', world.phone);
    const sam = samGrant.id;
    const lee = (await story.monitor('Lee Morgan', world.phone)).id;
    // Saturday's board, written by Dana: Sam certifies on P1-HO-TDSR, Lee Morgan helps.
    const saturdays = { workDate: '2026-10-10', projectId: p1 } as const;
    const certifying = await assigned(api, clock, dana, {
      ...saturdays,
      personId: sam,
      certifying: true,
      deviceId: world.phone,
    });
    await assigned(api, clock, dana, { ...saturdays, personId: lee });
    // Sam signs in on it with Monitor ID and password, and the phone takes his assignment
    // (ADR-444).
    if ((await taken(story, samGrant, world.phone)) !== certifying) {
      throw new Error('P1-HO-TDSR took another assignment than Sam’s.');
    }
    const summit = (
      await saved(contractors.contractor(dana, { name: 'Summit Debris Services', kind: 'HAULER' }))
    ).id;
    await saved(contractors.addPrime(dana, p1, summit));
    await saved(contractors.addPrime(dana, p2, coastline));

    const picked = async (list: 'vehicleType' | 'vehicleFeature' | 'crewType', name: string) => {
      const where = { where: { name } };
      if (list === 'vehicleType') return (await api.vehicleType.findFirstOrThrow(where)).id;
      if (list === 'vehicleFeature') return (await api.vehicleFeature.findFirstOrThrow(where)).id;
      return (await api.crewType.findFirstOrThrow(where)).id;
    };
    const sideboards = await picked('vehicleFeature', 'Sideboards');
    const dogBox = await picked('vehicleFeature', 'Dog Box');
    const curvedSides = await picked('vehicleFeature', 'Curved/Angled Sides/Floor');

    // Who is on a project and where: each contractor, its place and the prime it works under.
    const placesOn = async (projectId: string): Promise<string[]> => {
      const places = await api.projectContractor.findMany({
        where: { projectId, archivedAt: null },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      });
      const names = await api.contractor.findMany();
      const nameOf = (id: string | null) => names.find((one) => one.id === id)?.name ?? '';
      return places.map((place) =>
        place.position === 'PRIME'
          ? `${nameOf(place.contractorId)}: prime`
          : `${nameOf(place.contractorId)}: tier ${place.position === 'SUB_TIER_1' ? '1' : '2'} under ${nameOf(place.primeId)}`,
      );
    };
    // A project's certifications as people read them, by number.
    const certified = async (projectId: string): Promise<string[]> => {
      const rows = await api.certification.findMany({
        where: { projectId },
        orderBy: { certNumber: 'asc' },
      });
      const names = await api.contractor.findMany();
      const nameOf = (id: string | null) => names.find((one) => one.id === id)?.name;
      return rows.map((row) =>
        [
          row.certNumber,
          row.kind === 'CREW' ? 'crew' : `${String(row.capacityCy)} CY`,
          [nameOf(row.primeId), nameOf(row.firstTierSubId), nameOf(row.secondTierSubId)]
            .filter((name) => name !== undefined)
            .join(' > '),
        ].join(' · '),
      );
    };
    // What Sam's phone sends for one certification, made now.
    const made = (
      more: Partial<NewCertification> & Pick<NewCertification, 'certNumber' | 'boxes'>,
    ) => ({
      projectId: p1,
      kind: 'CONTAINER' as const,
      primeId: coastline,
      certifiedById: sam,
      deviceId: world.phone,
      assignmentId: certifying,
      ...more,
      // Each is its own record, made on the phone at the phone's own time.
      id: uuidv7(clock.now()),
      certifiedAt: clock.now(),
      deviceUtcOffsetMinutes: utcOffsetMinutes(timeZone, clock.now()),
    });

    story.check(
      'AC-01-19 setup asked for no sub: P1 has its two primes and nobody else',
      await placesOn(p1),
      ['Coastline Haulers LLC: prime', 'Summit Debris Services: prime'],
    );

    // ------------------------------------------------------------------------------------------
    story.at(saturday('09:10'), 'Sam certifies Coastline’s dump trailer, 730415, with Lee helping');
    const trailer = await saved(
      certifications.certify(
        made({
          certNumber: '730415',
          vehicleTypeId: await picked('vehicleType', 'Hydraulic Dump Trailer'),
          boxes: [primary(360, 96, 72), { ...primary(360, 96, 16), featureId: sideboards }],
          helperIds: [lee],
          driverName: 'Chris Dale',
          tagNumber: 'CHL 2207',
          tagState: 'FL',
          tagExpiry: '2027-06-30',
          clientRepresentativeName: 'Bayline County debris manager',
          contractorRepresentativeName: 'Coastline Haulers dispatch',
        }),
      ),
    );
    story.check(
      'AC-03-30 nobody typed its capacity: 3,041,280 cu in ÷ 46,656 = 65.19, so 65 CY',
      [trailer.capacityCy, trailer.signaturesOnFile, trailer.receivedAt.toISOString()],
      [65, false, new Date(saturday('09:10')).toISOString()],
    );
    const trailerAudit = await api.auditRecord.findMany({
      where: { actorId: sam },
      orderBy: { id: 'asc' },
    });
    story.check(
      'AC-03-59 after his sign-in (a security event and his session), the certification, its two boxes and its helper are each audited as Sam, from his phone; so is the job it queued in the same piece of work, for the worker to check its views (ADR-420)',
      trailerAudit.map((record) => [
        record.tableName,
        record.operation,
        record.source,
        record.deviceId,
      ]),
      [
        'security_event',
        'session',
        'certification',
        'certification_box',
        'certification_box',
        'certification_helper',
        'reconciliation_job',
      ].map((table) => [table, 'INSERT', 'DEVICE', world.phone]),
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      saturday('09:40'),
      'Rivera’s self-loader, 730416: Sam picks Coastline and types "Rivera Trucking" into tier 1',
    );
    // Through his phone, as a sync carries it (ADR-469, 470): the boxes as measured, and never
    // a capacity. The phone works one out to show him, by the rule the server uses.
    const samsPhone = story.phone({
      name: 'P1-HO-TDSR',
      deviceId: world.phone,
      monitorId: sam,
      assignmentId: certifying,
      projectId: p1,
      lists: await story.lists.held({ assignmentId: certifying, deviceId: world.phone }),
      timeZone,
    });
    // What Sam picks is by name from the lists his phone was sent (ADR-552 (3)): the truck lists
    // and his helper, Lee, the one other person on P1's board today.
    const samsLists = samsPhone.setup.lists;
    story.check(
      'AC-10-117, AC-10-118 Sam’s certifying phone holds the truck lists, P1’s two primes with nobody under them yet, and Lee as the one helper he may pick',
      [
        samsLists.vehicleTypes
          .filter(({ name }) => ['Hydraulic Dump Trailer', 'Self-Loading Truck'].includes(name))
          .map(({ name, kind }) => `${name}: ${kind}`),
        samsLists.vehicleFeatures.some(({ name }) => name === 'Dog Box'),
        samsLists.crewTypes.filter(({ name }) => ['Bucket Truck', 'Skid Steer'].includes(name))
          .length,
        samsLists.primes.map(({ name, subs }) => `${name} (${String(subs.length)} subs)`),
        samsLists.helpers.map(({ name }) => name),
      ],
      [
        ['Hydraulic Dump Trailer: CONTAINER', 'Self-Loading Truck: CONTAINER'],
        true,
        2,
        ['Coastline Haulers LLC (0 subs)', 'Summit Debris Services (0 subs)'],
        ['Lee Morgan'],
      ],
    );
    const riverasDriverAndTag = {
      driverName: 'Marco Rivera',
      driverLicenceNumber: 'R160-542-80-112-0',
      driverLicenceState: 'FL',
      driverLicenceExpiry: '2028-03-31',
      tagNumber: 'RVT 4821',
      tagState: 'FL',
      tagExpiry: '2027-03-31',
    };
    // The self-loader's sheet as the service takes it, by id: certified again on Wednesday.
    const selfLoaderSheet = {
      firstTierSub: 'Rivera Trucking',
      vehicleTypeId: await picked('vehicleType', 'Self-Loading Truck'),
      boxes: [
        primary(264, 92, 96),
        {
          shape: 'TRIANGLE' as const,
          sign: 'SUBTRACT' as const,
          length: 36,
          width: 92,
          height: 48,
          featureId: dogBox,
        },
      ] satisfies BoxInput[],
      ...riverasDriverAndTag,
    };
    // On his phone, the same sheet picked by name.
    const selfLoader = samsPhone.certify({
      kind: 'CONTAINER',
      paperNumber: '730416',
      prime: 'Coastline Haulers LLC',
      firstTierSub: 'Rivera Trucking',
      vehicleType: 'Self-Loading Truck',
      ...riverasDriverAndTag,
      boxes: [
        primary(264, 92, 96),
        {
          shape: 'TRIANGLE',
          sign: 'SUBTRACT',
          length: 36,
          width: 92,
          height: 48,
          feature: 'Dog Box',
        },
      ],
    });
    const onTheWire = JSON.stringify(samsPhone.sends());
    story.check(
      'AC-10-35, AC-03-30 what Sam’s phone sends for 730416 is its two boxes as measured: no capacity, though the phone shows him 48 CY, and never which phone it is from',
      [
        selfLoader.capacityCy,
        /capacity/i.test(onTheWire),
        onTheWire.includes(world.phone),
        samsPhone.sends().records.map((sent) => sent.record),
      ],
      [48, false, false, ['CERTIFICATION']],
    );
    story.check(
      'C82, AC-04-77 the phone syncs it with the five photographs Sam took of it, in one sync and after it: each answered "saved", and the phone holds nothing more',
      [
        await samsPhone.sync(story.server),
        samsPhone.answers.map((one) => `${one.sent.record} ${one.answer.answer}`),
        samsPhone.answers[0]?.answer,
        samsPhone.waitingRecords,
        samsPhone.waitingPhotos,
      ],
      [
        6,
        ['CERTIFICATION SAVED', ...Array<string>(5).fill('PHOTO SAVED')],
        { answer: 'SAVED', id: selfLoader.record.id, notes: [] },
        [],
        [],
      ],
    );
    const fivePhotos = await api.photo.findMany({
      where: { certificationId: selfLoader.record.id },
      orderBy: { view: 'asc' },
    });
    story.check(
      'ADR-179, 481 its five photographs are one of each view, each where the server put it, under P1 and its own id: no phone named a place',
      fivePhotos.map(
        (photo) =>
          `${String(photo.view)} ${photo.objectKey === `projects/${photo.projectId}/photos/${photo.id}` ? 'its place' : photo.objectKey}`,
      ),
      [
        'OPERATOR_WITH_PLACARD its place',
        'INTERIOR_OR_BACK its place',
        'RIGHT its place',
        'LEFT its place',
        'FRONT its place',
      ],
    );
    const sha256Of = (bytes: Uint8Array): string =>
      createHash('sha256').update(bytes).digest('hex');
    const filesOf: string[] = [];
    for (const photo of fivePhotos) {
      const kept = await story.media.read(photo.objectKey, story.policy.mediaFileBytesAtMost);
      filesOf.push(
        `${String(photo.view)} ${photo.uploadedAt === null ? 'not arrived' : 'arrived'}, ${kept !== null && sha256Of(kept.bytes) === photo.uploadedSha256 ? 'the file fingerprinted' : 'no such file'}`,
      );
    }
    story.check(
      'AC-04-77, C82 and each one’s file went up to the media endpoint after the sync that saved it: kept at its place, the very file whose SHA-256 Sam’s phone gave, its upload time written (ADR-482, 483)',
      [filesOf, samsPhone.holdsFiles],
      [
        [
          'OPERATOR_WITH_PLACARD arrived, the file fingerprinted',
          'INTERIOR_OR_BACK arrived, the file fingerprinted',
          'RIGHT arrived, the file fingerprinted',
          'LEFT arrived, the file fingerprinted',
          'FRONT arrived, the file fingerprinted',
        ],
        [],
      ],
    );
    const loader = await api.certification.findUniqueOrThrow({
      where: { id: selfLoader.record.id },
    });
    story.check(
      'AC-03-11 Rivera is on P1 from that moment, a tier 1 sub under Coastline',
      await placesOn(p1),
      [
        'Coastline Haulers LLC: prime',
        'Summit Debris Services: prime',
        'Rivera Trucking: tier 1 under Coastline Haulers LLC',
      ],
    );
    const rivera = await api.contractor.findFirstOrThrow({ where: { name: 'Rivera Trucking' } });
    story.check(
      'the firm has one Rivera Trucking, a hauler, and 730416 names it; its capacity is 48 CY',
      [rivera.kind, loader.firstTierSubId === rivera.id, loader.secondTierSubId, loader.capacityCy],
      ['HAULER', true, null, 48],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      saturday('10:05'),
      'Coastline’s two crews, 730417 and 730418, and its walking floor, 730419',
    );
    for (const [certNumber, crewType] of [
      ['730417', 'Bucket Truck'],
      ['730418', 'Skid Steer'],
    ] as const) {
      samsPhone.certify({
        kind: 'CREW',
        paperNumber: certNumber,
        prime: 'Coastline Haulers LLC',
        crewType,
        boxes: [],
      });
    }
    story.check(
      'the two crews go in one sync from Sam’s phone, nothing measured, with their five photographs each after them; each answered "saved"',
      [
        await samsPhone.sync(story.server),
        samsPhone.answers.slice(6).map((one) => `${one.sent.record} ${one.answer.answer}`),
      ],
      [
        12,
        [...Array<string>(2).fill('CERTIFICATION SAVED'), ...Array<string>(10).fill('PHOTO SAVED')],
      ],
    );
    await saved(
      certifications.certify(
        made({
          certNumber: '730419',
          vehicleTypeOther: 'Walking floor trailer',
          boxes: [
            primary(576, 96, 93),
            {
              shape: 'RADIUS_CORNER',
              sign: 'SUBTRACT',
              radius: 6,
              run: 576,
              corners: 2,
              featureId: curvedSides,
            },
          ],
        }),
      ),
    );
    story.check(
      'AC-03-01 P1’s five certifications, as the golden mission §1 has them',
      await certified(p1),
      [
        '730415 · 65 CY · Coastline Haulers LLC',
        '730416 · 48 CY · Coastline Haulers LLC > Rivera Trucking',
        '730417 · crew · Coastline Haulers LLC',
        '730418 · crew · Coastline Haulers LLC',
        '730419 · 110 CY · Coastline Haulers LLC',
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      saturday('11:10'),
      'A Tidewater Hauling truck, 730423: Coastline, "rivera trucking" in tier 1, "Tidewater Hauling" in tier 2',
    );
    const worked = [
      primary(240, 90, 60),
      // The sideboards are 12 high; Sam types 21.
      { ...primary(240, 90, 21), featureId: sideboards },
      { shape: 'TRIANGLE', sign: 'SUBTRACT', length: 30, width: 90, height: 40, featureId: dogBox },
    ] satisfies BoxInput[];
    const tidewaterTruck = await saved(
      certifications.certify(
        made({
          certNumber: '730423',
          firstTierSub: ' rivera  trucking',
          secondTierSub: 'Tidewater Hauling',
          boxes: worked,
        }),
      ),
    );
    story.check(
      'AC-03-12 Tidewater is placed in tier 2 under prime Coastline; Rivera, known already, isn’t entered twice',
      [
        await placesOn(p1),
        await api.contractor.count({
          where: { name: { contains: 'rivera', mode: 'insensitive' } },
        }),
      ],
      [
        [
          'Coastline Haulers LLC: prime',
          'Summit Debris Services: prime',
          'Rivera Trucking: tier 1 under Coastline Haulers LLC',
          'Tidewater Hauling: tier 2 under Coastline Haulers LLC',
        ],
        1,
      ],
    );
    story.check(
      'with the sideboards typed 21 high it works out to 1,695,600 cu in ÷ 46,656 = 36.34: 36 CY',
      tidewaterTruck.capacityCy,
      36,
    );

    // ------------------------------------------------------------------------------------------
    story.at(saturday('11:30'), 'What the service won’t save, and says why');
    const before = await api.certification.count();
    story.check(
      'a container with a measurement missing',
      await refused(
        certifications.certify(
          made({
            certNumber: '730424',
            boxes: [{ shape: 'RECTANGLE', sign: 'ADD', length: 240, width: 90 }],
          }),
        ),
      ),
      'MEASUREMENT_INVALID: The primary box: its height is missing. Every measurement is a whole number of inches, 1 or more.',
    );
    story.check(
      'a crew with a measured box',
      await refused(
        certifications.certify(
          made({ certNumber: '730424', kind: 'CREW', boxes: [primary(240, 90, 60)] }),
        ),
      ),
      'CREW_MEASURED: A crew is not measured: it has no boxes and no capacity.',
    );
    story.check(
      'a tier 2 sub with no tier 1',
      await refused(
        certifications.certify(
          made({
            certNumber: '730424',
            secondTierSub: 'Tidewater Hauling',
            boxes: [primary(240, 90, 60)],
          }),
        ),
      ),
      'SECOND_TIER_WITHOUT_FIRST: Not saved: Tidewater Hauling is typed into tier 2 with no tier 1 sub. A second-tier sub works under a first-tier sub of Coastline Haulers LLC.',
    );
    let twice = 'saved';
    try {
      await certifications.certify(made({ certNumber: '730415', boxes: [primary(240, 90, 60)] }));
    } catch (error) {
      twice = constraintOf(error);
    }
    story.check(
      'AC-03-03 a second 730415 on P1 is refused by the database: a cert number once per project',
      twice,
      'certification_project_id_cert_number_key',
    );
    story.check('nothing of the four was saved', await api.certification.count(), before);

    // ------------------------------------------------------------------------------------------
    story.at(
      saturday('11:45'),
      'A Summit truck on a pre-printed sheet, 88120: Sam picks Summit and types "Rivera Trucking" into tier 1',
    );
    story.check(
      'AC-01-17 Rivera is Coastline’s sub, never shared: the certification is saved under a separate contractor of that name, with a warning',
      await warned(
        certifications.certify(
          made({
            certNumber: '88120',
            primeId: summit,
            firstTierSub: 'Rivera Trucking',
            boxes: [primary(240, 90, 60)],
          }),
        ),
      ),
      ['SUB_PLACED_ELSEWHERE'],
    );
    story.check(
      'AC-03-05 the sheet’s number is kept as written; Rivera’s own place on P1 is unmoved',
      await certified(p1),
      [
        '730415 · 65 CY · Coastline Haulers LLC',
        '730416 · 48 CY · Coastline Haulers LLC > Rivera Trucking',
        '730417 · crew · Coastline Haulers LLC',
        '730418 · crew · Coastline Haulers LLC',
        '730419 · 110 CY · Coastline Haulers LLC',
        '730423 · 36 CY · Coastline Haulers LLC > Rivera Trucking > Tidewater Hauling',
        '88120 · 28 CY · Summit Debris Services > Rivera Trucking',
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('13', '16:20'),
      'Tuesday: Dana gives Luis Setup and the grant to correct. He finds the sideboards on 730423 were typed 21 high; they are 12, and he corrects them at his browser',
    );
    // A measuring mistake takes correct, and a contractor's record is setup's (ADR-424). Her request at his record; he holds nothing yet.
    await (
      await danas()
    ).answered(setPermissionsEndpoint, {
      ids: { userId: luis },
      json: { permissions: ['SETUP', 'CORRECT', 'VIEW_SETUP', 'VIEW_REVIEW'] },
    });
    // The sideboards are its second box, after the primary (0); its dog box is the third.
    const boxOf = (position: string, changes: { length?: number; height?: number }) => ({
      ids: { certificationId: tidewaterTruck.id, position },
      json: { changes },
    });
    const signedIn = await luiss();
    const lastAudited = (await api.auditRecord.findFirstOrThrow({ orderBy: { id: 'desc' } })).id;
    story.check(
      'a correction that leaves no capacity is refused in the domain’s words, and nothing changes: the dog box typed 3,000 long, not 30, subtracts more than the truck holds',
      refusalOf(
        await signedIn.asked(correctCertificationBoxEndpoint, boxOf('2', { length: 3000 })),
      ),
      '422 NOT_SAVED · NOTHING_HELD: The boxes work out to -3650400.00 cu in: they subtract as much as the primary box holds, or more. Check the measurements.',
    );
    const corrected = (
      await signedIn.answered(correctCertificationBoxEndpoint, boxOf('1', { height: 12 }))
    ).record;
    const correction = await api.auditRecord.findMany({
      where: {
        actorId: luis,
        id: { gt: lastAudited },
        // His browser's own session, refreshed as the story's clock moves on, is his sign-in's,
        // not a change to a record (ADR-501).
        tableName: { not: 'session' },
      },
      orderBy: { id: 'asc' },
    });
    story.check(
      'AC-03-51 corrected in place: 1,501,200 cu in ÷ 46,656 = 32.18, so 32 CY; the audit log keeps 21 and 36, with Luis as actor',
      [
        corrected.capacityCy,
        correction.map((record) => [
          record.tableName,
          record.operation,
          record.changedFields,
          record.priorValue === null
            ? null
            : (record.priorValue as Record<string, unknown>)[record.changedFields[0] ?? ''],
        ]),
      ],
      [
        32,
        [
          ['certification_box', 'UPDATE', ['height'], 21],
          ['certification', 'UPDATE', ['capacity_cy'], 36],
        ],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '08:20'),
      'Wednesday: sideboards were added to Rivera’s self-loader; Sam certifies it again as 730420',
    );
    story.check(
      'a replacement says why',
      await refused(
        certifications.certify(
          made({
            ...selfLoaderSheet,
            certNumber: '730420',
            replaces: { certificationId: loader.id, reason: ' ' },
          }),
        ),
      ),
      'REPLACEMENT_NEEDS_REASON: Not saved: certification 730420 replaces another, so it says why (sideboards added, bed rebuilt…).',
    );
    const replacement = await saved(
      certifications.certify(
        made({
          ...selfLoaderSheet,
          certNumber: '730420',
          boxes: [...selfLoaderSheet.boxes, { ...primary(264, 92, 12), featureId: sideboards }],
          replaces: { certificationId: loader.id, reason: 'sideboards added' },
        }),
      ),
    );
    const old = await api.certification.findUniqueOrThrow({ where: { id: loader.id } });
    story.check(
      'AC-03-53 730420 replaces 730416 and holds 2,543,616 cu in ÷ 46,656 = 54.52, so 55 CY; 730416 is unchanged',
      [
        replacement.capacityCy,
        replacement.replacesId === loader.id,
        replacement.replacedReason,
        old.capacityCy,
      ],
      [55, true, 'sideboards added', 48],
    );

    // ------------------------------------------------------------------------------------------
    story.at(on('14', '09:00'), 'Dana revokes the Summit truck, 88120, from Thursday');
    const summitTruck = await api.certification.findFirstOrThrow({
      where: { certNumber: '88120' },
    });
    // An admin's alone: Dana's request at her browser (ADR-079).
    const revoking = (reason: string) => ({
      ids: { certificationId: summitTruck.id },
      json: { from: '2026-10-15', reason },
    });
    story.check(
      'a date without a reason is refused before anything is read, and nothing changes',
      [
        refusalOf(await (await danas()).asked(revokeCertificationEndpoint, revoking(' '))),
        (await api.certification.findUniqueOrThrow({ where: { id: summitTruck.id } })).revokedFrom,
      ],
      ['400 BAD_REQUEST', null],
    );
    const revoked = (
      await (
        await danas()
      ).answered(revokeCertificationEndpoint, revoking('Truck left the project'))
    ).record;
    story.check(
      'AC-03-55 it keeps the date, the reason and who revoked it; nothing else on it changes',
      [
        revoked.revokedFrom,
        revoked.revokedReason,
        revoked.revokedById === dana,
        revoked.capacityCy,
      ],
      ['2026-10-15', 'Truck left the project', true, 28],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      on('14', '10:15'),
      'Another Rivera truck, 730425, is certified with its sub typed "Rivera Trucking Inc": a second spelling, never merged (ADR-529 (f))',
    );
    const secondTruck = await saved(
      certifications.certify(
        made({
          certNumber: '730425',
          firstTierSub: 'Rivera Trucking Inc',
          boxes: [primary(240, 90, 60)],
        }),
      ),
    );
    const typedAgain = await api.contractor.findFirstOrThrow({
      where: { name: 'Rivera Trucking Inc' },
    });
    story.check(
      'AC-01-21 (ADR-529 (f)) both spellings stand, each its own record and place; nothing merges them, and 730425 names the spelling Sam typed. The worker flags the certifications that name either, "Rivera Trucking" and "Rivera Trucking Inc" being alike, and Tidewater Hauling never (the story p1-reviewed)',
      [
        secondTruck.firstTierSubId === typedAgain.id,
        typedAgain.archivedAt,
        await api.contractor.count({ where: { name: { startsWith: 'Rivera' } } }),
        await placesOn(p1),
        [
          SubNames.alike('Rivera Trucking', 'Rivera Trucking Inc'),
          SubNames.alike('Rivera Trucking Inc', 'Tidewater Hauling'),
        ],
      ],
      [
        true,
        null,
        3,
        [
          'Coastline Haulers LLC: prime',
          'Summit Debris Services: prime',
          'Rivera Trucking: tier 1 under Coastline Haulers LLC',
          'Rivera Trucking: tier 1 under Summit Debris Services',
          'Rivera Trucking Inc: tier 1 under Coastline Haulers LLC',
          'Tidewater Hauling: tier 2 under Coastline Haulers LLC',
        ],
        [true, false],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(on('14', '11:00'), 'The record at the end');
    const people = new Map([
      [dana, 'Dana'],
      [luis, 'Luis'],
      [sam, 'Sam'],
    ]);
    const counted: Record<string, number> = {};
    for (const record of await api.auditRecord.findMany({
      where: { tableName: { in: ['certification', 'certification_box', 'certification_helper'] } },
    })) {
      const key = `${people.get(record.actorId ?? '') ?? 'nobody'}: ${record.tableName} ${record.operation} (${record.source})`;
      counted[key] = (counted[key] ?? 0) + 1;
    }
    story.check(
      'every certification, box and helper written or changed has its audit record and its actor',
      counted,
      {
        'Sam: certification INSERT (DEVICE)': 9,
        'Sam: certification_box INSERT (DEVICE)': 14,
        'Sam: certification_helper INSERT (DEVICE)': 1,
        'Luis: certification_box UPDATE (BACK_OFFICE)': 1,
        // His box corrected; no merge re-points one since ADR-529 (f).
        'Luis: certification UPDATE (BACK_OFFICE)': 1,
        'Dana: certification UPDATE (BACK_OFFICE)': 1,
      },
    );
  },
};

// The database constraint that refused a write, by name.
function constraintOf(error: unknown): string {
  const text = `${JSON.stringify(error)} ${error instanceof Error ? error.message : String(error)}`;
  return /constraint \\*"(\w+)\\*"/.exec(text)?.[1] ?? text.slice(0, 600);
}
