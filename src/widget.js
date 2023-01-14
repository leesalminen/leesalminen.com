import './widget.scss';

import { useState, useEffect } from 'react'
import { 
	NostrProvider, 
	dateToUnix, 
	useProfile, 
	useNostrEvents, 
	useNostr 
} from "nostr-react"

import {
  signEvent,
  getEventHash,
  generatePrivateKey,
  getPublicKey,
  nip04,
} from "nostr-tools"

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

const NostrChatWidget = ({recipientPk, relayUrls}) => {
	const [showWidget, setShowWidget] = useState(false)

	const keys = generateKeys()

	return (
		<div className="NostrChatWidget">
			{!showWidget &&
				<button className="show-button" onClick={() => {setShowWidget(true)}}>
					Live Chat
				</button>
			}

			{showWidget &&
				<NostrProvider relayUrls={relayUrls}>
					<NostrWidgetContainer
						keys={keys}
						recipientPk={recipientPk}
						setShowWidget={setShowWidget} />
				</NostrProvider>
			}
		</div>
	)
}

const NostrWidgetContainer = ({ keys, recipientPk, setShowWidget }) => {
	const { data: userData } = useProfile({pubkey: recipientPk});

	return (
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
	    			authors={[recipientPk, keys.pk]}
	    			recipientPk={recipientPk} />
	  		</div>
		  	<div className="message-box">
		    	<NostrPublish
		    		keys={keys}
		    		recipientPk={recipientPk} />
		  	</div>
			</div>
		</section>
	)
}

const NostrPublish = ({keys, recipientPk}) => {
	const { publish } = useNostr();
	const [message, setMessage] = useState('')

	const sendMessage = async () => {
		let ciphertext = await nip04.encrypt(keys.sk, recipientPk, message)

		let event = {
		  kind: 4,
		  pubkey: keys.pk,
		  created_at: dateToUnix(),
		  tags: [['p', recipientPk]],
		  content: ciphertext,
		}
		event.id = getEventHash(event)
		event.sig = signEvent(event, keys.sk)

		publish(event)

		setMessage('')
	}

	const handleChange = (event) => {
    setMessage(event.target.value)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      sendMessage()
    }
  }

	return (
		<>
			<input onChange={handleChange} onKeyDown={handleKeyDown} value={message} type="text" className="message-input" placeholder="Type message..." />
	    <button type="submit" className="message-submit" onClick={sendMessage}>Send</button>
	  </>
	)	
}

const NostrEvents = ({ authors, keys, recipientPk }) => {
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
						recipientPk={recipientPk}
						keys={keys}
						message={message} />
				)
			})}
		</div>

	)
}

const NostrEvent = ({message, keys, recipientPk}) => {
	const [plaintext, setPlaintext] = useState('');

	useEffect(() => {
   	const getPlaintext = async () => {
   		try {
       	const plaintext = await nip04.decrypt(keys.sk, recipientPk, message.content)
       	setPlaintext(plaintext)
      } catch (e) {
      	return
      }
   	}
   	getPlaintext();
  }, [])

	if(!plaintext) {
		return (<></>)
	}

	return (
		<div key={message.id} className={message.pubkey == keys.pk ? 'message message-personal' : 'message'}>
			{plaintext}
		</div>
	)
}

export default NostrChatWidget