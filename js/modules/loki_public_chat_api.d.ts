import {
  LokiAppDotNetServerInterface,
  LokiPublicChannelAPI,
} from './loki_app_dot_net_api';

export interface LokiPublicChatFactoryInterface {
  ourKey: string;
  findOrCreateServer(url: string): Promise<LokiAppDotNetServerInterface | null>;
  findOrCreateChannel(
    url: string,
    channelId: number,
    conversationId: string
  ): Promise<LokiPublicChannelAPI | null>;
  getListOfMembers(): Promise<Array<{ authorPhoneNumber: string }>>;
  setProfileName(name: string): 
}

declare class LokiPublicChatFactoryAPI
  implements LokiPublicChatFactoryInterface {
  constructor(ourKey: string);
}

export default LokiPublicChatFactoryAPI;
