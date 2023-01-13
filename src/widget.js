import './widget.scss';

import { useState, useEffect, useRef } from 'react'
import { NostrProvider, dateToUnix, useProfile, useNostrEvents, useNostr } from "nostr-react";

import {
  signEvent,
  getEventHash,
  generatePrivateKey,
  getPublicKey,
  nip04,
} from "nostr-tools"

const theirPublicKey = '5f498ff809e02c5685e3bda193fcd7147a22e7b3971079549b0bb37643f3cacc'
const relayUrls = ['wss://no.str.cr', 'wss://relay.damus.io', 'wss://nostr.fly.dev', 'wss://nostr.robotechy.com']

const generateKeys = () => {
	let sk = generatePrivateKey()
	let pk = getPublicKey(sk)
	let cachedKeys = localStorage.getItem('nostr-chat-widget-keypair')

	if(cachedKeys) {
		cachedKeys = JSON.parse(cachedKeys)

		sk = cachedKeys.sk
		pk = cachedKeys.pk
	}

	const keys = {
		sk: sk,
		pk: pk,
	}

	localStorage.setItem('nostr-chat-widget-keypair', JSON.stringify(keys))

	return keys
}

function NostrChatWidget () {
	return (
		<NostrProvider relayUrls={relayUrls}>
			<NostrWidget
				theirPublicKey={theirPublicKey} />
		</NostrProvider>
	)
}

function NostrWidget({theirPublicKey}) {
	const [showWidget, setShowWidget] = useState(false)

	const keys = generateKeys()

	const { data: userData } = useProfile({pubkey: theirPublicKey});

	return (
		<div className="NostrChatWidget">
			{!showWidget &&
				<button className="show-button" onClick={() => {setShowWidget(true)}}>
					Live Chat
				</button>
			}

			{showWidget &&
				<section className="avenue-messenger">
				  	<div className="menu">
				   		<div className="button" onClick={() => {setShowWidget(false)}}>&#10005;</div>
				  	</div>
				  	<div className="agent-face">
				    	<div className="half">
				     		<img className="agent circle" src={userData && userData.picture ? userData.picture : ''} alt="pfp" />
				     	</div>
				  	</div>
					<div className="chat">
				  		<div className="chat-title">
				    		<h1>{userData && userData.name ? userData.name : ''}</h1>
				    		<h2>{userData && userData.about ? userData.about : ''}</h2>
				  		</div>
				  		<div className="messages">
				    		<NostrEvents
				    			keys={keys}
				    			authors={[theirPublicKey, keys.pk]} />
				  		</div>
					  	<div className="message-box">
					    	<NostrPublish
					    		keys={keys}
					    		theirPublicKey={theirPublicKey} />
					  	</div>
					</div>
				</section>
			}
		</div>
	)
}

function NostrPublish({keys, theirPublicKey}) {
	const { publish } = useNostr();
	const messageRef = useRef(null);

	const sendMessage = async () => {
		const message = messageRef.current.value

		let ciphertext = await nip04.encrypt(keys.sk, theirPublicKey, message)

		let event = {
		  kind: 4,
		  pubkey: keys.pk,
		  created_at: dateToUnix(),
		  tags: [['p', theirPublicKey]],
		  content: ciphertext,
		}
		event.id = getEventHash(event)
		event.sig = signEvent(event, keys.sk)

		publish(event)

		messageRef.current.value = ''
	}

	return (
		<>
			<textarea ref={messageRef} type="text" className="message-input" placeholder="Type message..."></textarea>
	    	<button type="submit" className="message-submit" onClick={sendMessage}>Send</button>
	    </>
	)	
}

function NostrEvents({ authors, keys }) {
	const { events } = useNostrEvents({
	    filter: {
	    	kinds: [4],
		   	authors: authors,
		   	"#p": authors,
	    },
	})

	useEffect(() => {
		setTimeout(() => {
			const element = document.querySelector('.messages-content');
		    element.scrollTop = element.scrollHeight;
		}, 100)
	}, [events])

	return (
		<div className="messages-content">
			{events.sort((a, b) => a.created_at - b.created_at).map((message) => {
				return (
					<NostrEvent
						key={message.id}
						theirPublicKey={theirPublicKey}
						keys={keys}
						message={message} />
				)
			})}
		</div>

	)
}

function NostrEvent({message, keys, theirPublicKey}) {
	const [plaintext, setPlaintext] = useState('');

	useEffect(() => {
     	async function getPlaintext() {
         	const plaintext = await nip04.decrypt(keys.sk, theirPublicKey, message.content)
         	setPlaintext(plaintext)
     	}
     	getPlaintext();
  	}, [])

	return (
		<div key={message.id} className={message.pubkey == keys.pk ? 'message message-personal' : 'message'}>
			{plaintext}
		</div>
	)
}

export default NostrChatWidget