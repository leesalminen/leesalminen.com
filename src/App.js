import './App.css';
import { useEffect } from 'react';
import Terminal from 'terminal-in-react';
import pseudoFileSystemPlugin from 'terminal-in-react-pseudo-file-system-plugin';
import OnMountPlugin from './OnMountPlugin';
import NostrChatWidget from './widget'

const FileSystemPlugin = pseudoFileSystemPlugin();

function App() {

  useEffect(() => {
    const input = document.querySelector('input[type="text"]')
    input.setAttribute('autocomplete', 'off')
    input.setAttribute('autocorrect', 'off')
    input.setAttribute('autocapitalize', 'off')
    input.setAttribute('spellcheck', 'false')
  })
  
  return (
    <div>
      <Terminal
        plugins={[
          FileSystemPlugin,
          OnMountPlugin
        ]}
        hideTopBar={true}
        allowTabs={false}
        startState='maximised'
        color='green'
        backgroundColor='black'
        barColor='black'
        style={{ fontWeight: "bold", fontSize: "1em" }}
        commands={{
          email: () => 'My email is me@leesalminen.com. Get in touch!',
          whoami: () => '42',
          about: () => `I've lived in/around NYC, Buffalo NY, Boulder CO, Los Angeles CL, Dominical CR.`
        }}
        descriptions={{
          email: 'Send me an email',
          whoami: 'what is the meaning of life?',
          about: 'Want to know a curated selection of things about me?'
        }}
        msg={`Hi there, I'm Lee Salminen! I'm a father, husband, technologist and entrepreneur. Try typing help to see a list of available commands`}
      />
    <NostrChatWidget
      recipientPk={'5f498ff809e02c5685e3bda193fcd7147a22e7b3971079549b0bb37643f3cacc'}
      relayUrls={['wss://no.str.cr', 'wss://relay.damus.io', 'wss://nostr.fly.dev', 'wss://nostr.robotechy.com']} />
    </div>
  );
}

export default App;
