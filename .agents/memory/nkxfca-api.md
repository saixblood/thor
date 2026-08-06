---
name: nkxfca API reference
description: Verified real API signatures for @neoaz07/nkxfca — always use these, never guess
---

## Naming rule
`api[filename_without_extension]` — the internal function name inside the file is irrelevant.

## Critical gotchas

- `api.getThreadInfo(threadID)` — **pure async, NO callback**
  ```js
  const info = await api.getThreadInfo(threadID);
  // → { threadName, participantIDs, nicknames: { uid: name } }
  ```

- `api.sendTypingIndicator(sendTyping: boolean, threadID, callback)` — boolean FIRST
  ```js
  await api.sendTypingIndicator(true,  threadID); // start
  await api.sendTypingIndicator(false, threadID); // stop
  ```

- `api.nickname(...)` — NOT `api.setNickname`
  ```js
  await api.nickname(nickname, threadID, participantID);
  ```

- `api.gcmember(action, userIDs, threadID, callback)` — action: "add" | "remove"

## Full verified signatures

| Method | Signature | Note |
|--------|-----------|------|
| `api.addUserToGroup` | `(userID, threadID, callback)` | async |
| `api.changeAdminStatus` | `(threadID, adminID, adminStatus, callback)` | callback |
| `api.changeArchivedStatus` | `(threadIDs, archive, callback)` | async |
| `api.changeAvatar` | `(image, caption, timestamp, callback)` | async |
| `api.changeBio` | `(bio, publish, callback)` | async |
| `api.changeBlockedStatus` | `(userID, block, callback)` | async |
| `api.changeGroupImage` | `(image, threadID, callback)` | async |
| `api.changeThreadColor` | `(color, threadID, callback)` | async |
| `api.changeThreadEmoji` | `(emoji, threadID, callback)` | callback |
| `api.createNewGroup` | `(participantIDs, groupTitle, callback)` | async |
| `api.createPoll` | `(threadID, questionText, options, callback)` | async |
| `api.deleteMessage` | `(messageID, callback)` | async |
| `api.deleteThread` | `(threadOrThreads, callback)` | async |
| `api.editMessage` | `(text, messageID, callback)` | callback |
| `api.emoji` | `(emoji, threadID, callback, initiatorID)` | callback |
| `api.follow` | `(senderID, boolean, callback)` | callback |
| `api.forwardMessage` | `(messageID, threadIDs, callback)` | async |
| `api.gcmember` | `(action, userIDs, threadID, callback)` | async — action: "add"\|"remove" |
| `api.gcname` | `(newName, threadID, callback, initiatorID)` | callback + Promise |
| `api.gcrule` | `(action, userID, threadID, callback)` | async |
| `api.getFriendsList` | `(callback)` | async |
| `api.getMessage` | `(threadID, messageID, callback)` | callback |
| `api.getTheme` | `(threadID, callback)` | async |
| `api.getThemeInfo` | `(identifier, callback)` | async |
| `api.getThreadHistory` | `(threadID, amount, timestamp)` | async |
| `api.getThreadInfo` | `(threadID)` | **pure async — NO callback** |
| `api.getThreadList` | `(limit, timestamp=null, tags=["INBOX"])` | async |
| `api.getThreadPictures` | `(threadID, offset, limit, callback)` | async |
| `api.getUserID` | `(link, callback)` | async |
| `api.getUserInfo` | `(id, usePayload, callback, groupFields=[])` | callback |
| `api.getUserInfoV2` | `(idOrList, callback)` | callback |
| `api.handleMessageRequest` | `(threadID, accept, callback)` | async |
| `api.httpGet` | `(url, form, customHeader, callback, notAPI)` | callback |
| `api.httpPost` | `(url, form, customHeader, callback, notAPI)` | callback |
| `api.httpPostFormData` | `(url, form, customHeader, callback, notAPI)` | callback |
| `api.listenMqtt` | `(callback)` → returns stopListening fn | async |
| `api.logout` | `()` | async |
| `api.markAsDelivered` | `(threadID, messageID)` | async |
| `api.markAsRead` | `(threadID, read, callback)` | async |
| `api.markAsReadAll` | `()` | async |
| `api.markAsSeen` | `(seen_timestamp, callback)` | async |
| `api.muteThread` | `(threadID, muteSeconds, callback)` | async |
| `api.nickname` | `(nickname, threadID, participantID, callback, initiatorID)` | callback + Promise |
| `api.pinMessage` | `(action, threadID, messageID)` | async |
| `api.removeUserFromGroup` | `(userID, threadID, callback)` | async |
| `api.resolvePhotoUrl` | `(photoID, callback)` | callback |
| `api.searchForThread` | `(searchQuery, callback)` | async |
| `api.sendMessage` | `(msg, threadID, callback, replyToMessage, isGroup)` | async |
| `api.sendTypingIndicator` | `(sendTyping: boolean, threadID, callback)` | async |
| `api.setMessageReactionMqtt` | `(reaction, messageID, threadID)` | callback |
| `api.setThreadTheme` | `(threadID, themeData, callback)` | callback |
| `api.setThreadThemeMqtt` | `(threadID, themeFBID, callback)` | callback |
| `api.shareContact` | `(text, senderID, threadID, callback)` | callback |
| `api.theme` | `(themeName, threadID, callback, initiatorID)` | async |
| `api.unfriend` | `(userID, callback)` | async |
| `api.getAppState` | `()` | sync → cookie array |
| `api.getCurrentUserID` | `()` | sync → string UID |
| `api.setOptions` | `(options)` | sync |
