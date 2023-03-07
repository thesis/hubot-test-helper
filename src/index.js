import {statSync, readdirSync} from 'fs';
import {resolve as _resolve, dirname, basename} from 'path';
import {Response, Robot, Adapter, User, TextMessage, EnterMessage, LeaveMessage} from 'hubot';

process.setMaxListeners(0);

class MockResponse extends Response {
  sendPrivate(/* ...strings*/) {
    const strings = [].slice.call(arguments, 0);

    this.robot.adapter.sendPrivate.apply(this.robot.adapter, [this.envelope].concat(strings));
  }
}

class MockRobot extends Robot {
  constructor(httpd) {
    if (httpd == null) {httpd = true;}
    super(null, null, httpd, 'hubot');

    this.messagesTo = {};

    this.Response = MockResponse;
  }

  messageRoom(roomName, str) {
    if (roomName == this.adapter.name) {
      this.adapter.messages.push(['hubot', str]);
    } else {
      if (!(roomName in this.messagesTo)) {
        this.messagesTo[roomName] = [];
      }
      this.messagesTo[roomName].push(['hubot', str]);
    }
  }

  loadAdapter() {
    this.adapter = new Room(this);
  }
}

class Room extends Adapter {
  // XXX: https://github.com/hubotio/hubot/pull/1390
  static messages(obj) {
    if (obj instanceof MockRobot) {
      return obj.adapter.messages;
    } else {
      return obj.messages;
    }
  }

  constructor(robot) {
    super();
    this.robot = robot;
    this.messages = [];

    this.privateMessages = {};

    this.user = {
      say: (userName, message, userParams) => this.receive(userName, message, userParams),
      enter: (userName, userParams) => this.enter(userName, userParams),
      leave: (userName, userParams) => this.leave(userName, userParams)
    };
  }

  receive(userName, message, userParams) {
    if (userParams == null) {userParams = {};}
    return new Promise(resolve => {
      let textMessage = null;
      if ((typeof message === 'object') && message) {
        textMessage = message;
      } else {
        userParams.room = this.name;
        const user = new User(userName, userParams);
        textMessage = new TextMessage(user, message);
      }

      this.messages.push([userName, textMessage.text]);
      this.robot.receive(textMessage, resolve);
    });
  }

  destroy() {
    if (this.robot.server) {this.robot.server.close();}
  }

  reply(envelope/*, ...strings*/) {
    const strings = [].slice.call(arguments, 1);

    strings.forEach((str) => Room.messages(this).push(['hubot', `@${envelope.user.name} ${str}`]));
  }

  send(envelope/*, ...strings*/) {
    const strings = [].slice.call(arguments, 1);

    strings.forEach((str) => Room.messages(this).push(['hubot', str]));
  }

  sendPrivate(envelope/*, ...strings*/) {
    const strings = [].slice.call(arguments, 1);

    if (!(envelope.user.name in this.privateMessages)) {
      this.privateMessages[envelope.user.name] = [];
    }
    strings.forEach((str) => this.privateMessages[envelope.user.name].push(['hubot', str]));
  }

  robotEvent() {
    this.robot.emit.apply(this.robot, arguments);
  }

  enter(userName, userParams) {
    if (userParams == null) {userParams = {};}
    return new Promise(resolve => {
      userParams.room = this.name;
      const user = new User(userName, userParams);
      this.robot.receive(new EnterMessage(user), resolve);
    });
  }

  leave(userName, userParams) {
    if (userParams == null) {userParams = {};}
    return new Promise(resolve => {
      userParams.room = this.name;
      const user = new User(userName, userParams);
      this.robot.receive(new LeaveMessage(user), resolve);
    });
  }
}

class Helper {
  constructor(scriptsPaths) {
    if (!Array.isArray(scriptsPaths)) {
      scriptsPaths = [scriptsPaths];
    }
    this.scriptsPaths = scriptsPaths;
  }

  createRoom(options) {
    if (options == null) {options = {};}
    const robot = new MockRobot(options.httpd);

    if ('response' in options) {
      robot.Response = options.response;
    }

    for (let script of this.scriptsPaths) {
      script = _resolve(script);
      if (statSync(script).isDirectory()) {
        for (let file of readdirSync(script).sort()) {
          robot.loadFile(script, file);
        }
      } else {
        robot.loadFile(dirname(script), basename(script));
      }
    }

    robot.brain.emit('loaded');

    robot.adapter.name = options.name || 'room1';
    return robot.adapter;
  }
}
Helper.Response = MockResponse;

export default Helper;
