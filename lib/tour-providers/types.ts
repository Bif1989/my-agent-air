export type TourProviderId = "samo";

export type TourSearchInput = {
  provider?: TourProviderId;
  departureTownId: number;
  destinationStateId: number;
  checkInFrom: string;
  checkInTo?: string;
  nightsFrom: number;
  nightsTo?: number;
  adults: number;
  children?: number;
  childAges?: number[];
  currencyId?: number;
  tourIds?: number[];
  hotelIds?: number[];
  mealIds?: number[];
  roomIds?: number[];
  onlyAvailable?: boolean;
  instantConfirmation?: boolean;
};

export type TourOffer = {
  provider: TourProviderId;
  providerOfferId: string;
  tourName: string;
  destination: string;
  hotel: string;
  hotelStars: string;
  meal: string;
  room: string;
  accommodation: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  price: number;
  currency: string;
  available: boolean;
  instantConfirmation: boolean;
  stopSale: boolean;
  bestPrice: boolean;
  incomingPartner: string;
  providerMeta: {
    tourKey: string;
    hotelKey: string;
    townKey: string;
    mealKey: string;
    roomKey: string;
    currencyKey: string;
  };
};

export type TourSearchResult = {
  provider: TourProviderId;
  offers: TourOffer[];
  count: number;
};

export interface TourProvider {
  id: TourProviderId;
  configured(): boolean;
  search(input: TourSearchInput, signal?: AbortSignal): Promise<TourSearchResult>;
}
