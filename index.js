#!/usr/bin/env node

const FabricClient = require('fabric-client')
const os = require('os')
const fs = require('fs')
const glob = require('glob')
const path = require('path')
const program = require('commander')

function populate(connectionProfileCfg, cryptoCfg, keyValueStorePath) {
  // Let's prepopulate the K/V store
  const creds = JSON.parse(fs.readFileSync(connectionProfileCfg, 'utf8'))

  let promises = Object.keys(creds.organizations).map(orgMSP => {
    let org = orgMSP.substring(0, 4)
    let p = new Promise((resolve, reject) => {
      let priv = `${cryptoCfg}/peerOrganizations/${org}.example.com/users/Admin@${org}.example.com/msp/keystore/*_sk`
      glob(priv, null, (err, privkeys) => {
        if (err || privkeys.length < 1) {
          console.error(`Unable to find private key in ${priv}: ${err}`)
          reject(err)
        }

        let userOpts = {
          username: `Admin@${org}.example.com`,
          mspid: `${orgMSP}`,
          _org: org,
          cryptoContent: {
            signedCert: `${cryptoCfg}/peerOrganizations/${org}.example.com/users/Admin@${org}.example.com/msp/signcerts/Admin@${org}.example.com-cert.pem`,
            privateKey: privkeys[0]
          },
          skipPersistence: false
        }

        resolve(userOpts)
      })
    })
    return p
  })


  Promise.all(promises).then(adminOpts => {
    let cbs = adminOpts.map((userOpts) => {
      let fc = FabricClient.loadFromConfig(connectionProfileCfg)
      let kvs_path = path.join('./dappinstances/.hfc-key-store/', userOpts._org)
      if (keyValueStorePath) {
        kvs_path = path.join(keyValueStorePath, userOpts._org)
      }
      creds.client = { credentialStore: { path: kvs_path } }
      let cryptoSuite = FabricClient.newCryptoSuite()
      fc.setCryptoSuite(cryptoSuite)

      return FabricClient.newDefaultKeyValueStore({
        path: kvs_path
      }).then((store) => {
        fc.setStateStore(store)
        return FabricClient.newCryptoKeyStore({
          path: kvs_path
        })
      }).then((cryptoStore) => {
        cryptoSuite.setCryptoKeyStore(cryptoStore)
        console.log(`Prepopulating key/value store for ${userOpts.username} located at '${kvs_path}'.`)
        let obj = {}
        return fc.getUserContext(userOpts.username, true).then(user => {
          if (user !== null) {
            return user
          } else {
            return fc.createUser(userOpts)
          }
        }).then(user => {
          obj.username = userOpts.username
          return fc.getPeersForOrg(userOpts.mspid)
        }).then(peers => {
          obj.peers = JSON.stringify(peers)
          return fc.queryChannels(peers[0], true)
        }).then(channels => {
          obj.channels = JSON.stringify(channels)
          return obj
        })
      })
    })
    return Promise.all(cbs)
  }).then(objs => {
    console.log(objs)
    console.log("All set. Key value store populated.")
  }).catch(err => {
    console.error(err)
    console.error("Someting went wrong")
  })
}

program
  .version('0.0.1', '-v, --version')
  .arguments('<connectionProfileCfg> <cryptoCfg> <keyValueStorePath>')
  .action(populate)
program.parse(process.argv)

if (process.argv.slice(2).length < 3) {
  program.outputHelp()
}
