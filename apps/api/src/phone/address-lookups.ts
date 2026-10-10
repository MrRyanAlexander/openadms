// An address looked up for a phone's GPS (ARCHITECTURE §3 "Road distance and addresses";
// adms-field-app §4A.4; spec/acceptance/04-field-capture.md AC-04-24; BACKLOG 2.5.3, C117,
// C120; ADR-111, 119, 449, 455). A collecting monitor captures the GPS and asks for its
// address; the phone asks the API, the API asks our own address server, and the phone is
// answered the street number and name, or none.
//
// - **Never a refusal for want of an address.** Where the map has no street at the point, and
//   where the address server gives no answer, the phone is told which and the monitor types the
//   street number and name, as with no connection (ADR-111): the field event then says its
//   address was typed.
// - **Nothing is written and nothing is kept:** a lookup is no record. The address reaches the
//   server again on the field event, with whether it was looked up or typed.
// - **Neither the point nor the address is logged** (a point is where a private citizen
//   lives): the controller logs who asked and what came of it.
import type { GpsPoint, NoAddressReason } from '@open-adms/domain';

import type { Addresses } from './address-server.ts';

export type AddressLookedUp =
  | { readonly address: string; readonly noAddress: null }
  | {
      readonly address: null;
      readonly noAddress: NoAddressReason;
      // Why the address server gave no answer, for the server's log.
      readonly failure?: unknown;
    };

export class AddressLookups {
  private readonly addresses: Addresses;

  constructor(addresses: Addresses) {
    this.addresses = addresses;
  }

  async lookedUp(point: GpsPoint): Promise<AddressLookedUp> {
    let address: string | null;
    try {
      address = await this.addresses.addressOf(point);
    } catch (failure) {
      return { address: null, noAddress: 'NOT_ANSWERED', failure };
    }
    return address === null
      ? { address: null, noAddress: 'NO_STREET_THERE' }
      : { address, noAddress: null };
  }
}
