import { ConversationModel } from '../models/conversation';
import { ConversationController } from '../session/conversations';
import { MentionsInputState } from '../state/ducks/mentionsInput';

// tslint:disable: no-unnecessary-class
export class FindMember {
  public static async findMember(
    pubkey: String,
    convoId: string,
    clearOurInterval?: any
  ): Promise<ConversationModel | null> {
    let groupMembers;

    const groupConvos = ConversationController.getInstance()
      .getConversations()
      .filter((d: any) => {
        return !d.isPrivate();
      });
    const thisConvo = groupConvos.find((d: any) => {
      return d.id === convoId;
    });

    if (!thisConvo) {
      // If this gets triggered, is is likely because we deleted the conversation
      if (clearOurInterval) {
        clearOurInterval();
      }

      return null;
    }

    if (thisConvo.isPublic()) {
      const publicMembers = (await window.inboxStore?.getState()
        .mentionsInput) as MentionsInputState;
      const memberConversations = publicMembers
        .map(publicMember =>
          ConversationController.getInstance().get(publicMember.authorPhoneNumber)
        )
        .filter((c: any) => !!c);
      groupMembers = memberConversations;
    } else {
      const privateConvos = ConversationController.getInstance()
        .getConversations()
        .filter((d: any) => d.isPrivate());
      const members = thisConvo.attributes.members;
      if (!members) {
        return null;
      }
      const memberConversations = members
        .map((m: any) => privateConvos.find((c: any) => c.id === m))
        .filter((c: any) => !!c);
      groupMembers = memberConversations;
    }

    return groupMembers.find(({ id: pn }: any) => pn && pn === pubkey);
  }
}
