//! TLS 1.3 with a certificate on both sides (spec `Core - Appairage QR`, E4).
//! Self-signed certificates: nobody signs them, so the usual chain check means
//! nothing here. The handshake only proves that the iPhone holds the key of its
//! certificate; `link` then pins that certificate by its fingerprint.

use std::sync::Arc;

use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::crypto::{verify_tls13_signature, CryptoProvider};
use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer, ServerName, UnixTime};
use rustls::server::danger::{ClientCertVerified, ClientCertVerifier};
use rustls::{DigitallySignedStruct, DistinguishedName, SignatureScheme};

use crate::identity::{fingerprint_of, Fingerprint, Identity};
use crate::Error;

fn provider() -> Arc<CryptoProvider> {
    Arc::new(rustls::crypto::ring::default_provider())
}

fn key_of(identity: &Identity) -> Result<PrivateKeyDer<'static>, Error> {
    let key = rcgen::KeyPair::from_pem(&identity.key_pem).map_err(|e| Error::Identity(e.to_string()))?;
    Ok(PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(key.serialize_der())))
}

pub fn server_config(identity: &Identity) -> Result<Arc<rustls::ServerConfig>, Error> {
    let provider = provider();
    let config = rustls::ServerConfig::builder_with_provider(provider.clone())
        .with_protocol_versions(&[&rustls::version::TLS13])
        .map_err(|e| Error::Identity(e.to_string()))?
        .with_client_cert_verifier(Arc::new(AnyClientCert { provider }))
        .with_single_cert(vec![CertificateDer::from(identity.cert_der.clone())], key_of(identity)?)
        .map_err(|e| Error::Identity(e.to_string()))?;
    Ok(Arc::new(config))
}

/// By cable the PC opens the connection, so it is the TLS client and the
/// iPhone the server (ADR-0031). Same certificates; the caller pins the
/// iPhone's one exactly as when the PC is the server.
pub fn cable_client_config(identity: &Identity) -> Result<Arc<rustls::ClientConfig>, Error> {
    let provider = provider();
    let config = rustls::ClientConfig::builder_with_provider(provider.clone())
        .with_protocol_versions(&[&rustls::version::TLS13])
        .map_err(|e| Error::Identity(e.to_string()))?
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(AnyServerCert { provider }))
        .with_client_auth_cert(vec![CertificateDer::from(identity.cert_der.clone())], key_of(identity)?)
        .map_err(|e| Error::Identity(e.to_string()))?;
    Ok(Arc::new(config))
}

/// Not checked by either side (self-signed certificates), only sent.
pub fn cable_server_name() -> ServerName<'static> {
    ServerName::try_from("hyphn.local").expect("valid name")
}

/// Fingerprint of the certificate the other side presented.
pub fn peer_fingerprint(conn: &rustls::CommonState) -> Option<Fingerprint> {
    conn.peer_certificates().and_then(|c| c.first()).map(|c| fingerprint_of(c))
}

/// Accepts any client certificate whose signature checks out; pinning is done
/// by the caller against the paired device.
#[derive(Debug)]
struct AnyClientCert {
    provider: Arc<CryptoProvider>,
}

impl ClientCertVerifier for AnyClientCert {
    fn root_hint_subjects(&self) -> &[DistinguishedName] {
        &[]
    }

    fn verify_client_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _now: UnixTime,
    ) -> Result<ClientCertVerified, rustls::Error> {
        Ok(ClientCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Err(rustls::Error::General("TLS 1.2 is not allowed".into()))
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        verify_tls13_signature(message, cert, dss, &self.provider.signature_verification_algorithms)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.provider.signature_verification_algorithms.supported_schemes()
    }
}

/// The iPhone side of a cable connection: any certificate whose signature
/// checks out, pinned afterwards by the caller.
#[derive(Debug)]
struct AnyServerCert {
    provider: Arc<CryptoProvider>,
}

impl ServerCertVerifier for AnyServerCert {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Err(rustls::Error::General("TLS 1.2 is not allowed".into()))
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        verify_tls13_signature(message, cert, dss, &self.provider.signature_verification_algorithms)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.provider.signature_verification_algorithms.supported_schemes()
    }
}

#[cfg(test)]
pub mod client {
    use super::*;
    use rustls::pki_types::ServerName;
    use rustls::client::danger::{HandshakeSignatureValid as Valid, ServerCertVerified, ServerCertVerifier};

    /// What the iPhone does (and the tests): present its certificate and accept
    /// the PC only if its fingerprint is the pinned one.
    pub fn client_config(identity: &Identity, pinned: Fingerprint) -> Arc<rustls::ClientConfig> {
        let provider = provider();
        let config = rustls::ClientConfig::builder_with_provider(provider.clone())
            .with_protocol_versions(&[&rustls::version::TLS13])
            .unwrap()
            .dangerous()
            .with_custom_certificate_verifier(Arc::new(Pinned { provider, pinned }))
            .with_client_auth_cert(vec![CertificateDer::from(identity.cert_der.clone())], key_of(identity).unwrap())
            .unwrap();
        Arc::new(config)
    }

    pub fn server_name() -> ServerName<'static> {
        ServerName::try_from("hyphn.local").unwrap()
    }

    #[derive(Debug)]
    struct Pinned {
        provider: Arc<CryptoProvider>,
        pinned: Fingerprint,
    }

    impl ServerCertVerifier for Pinned {
        fn verify_server_cert(
            &self,
            end_entity: &CertificateDer<'_>,
            _intermediates: &[CertificateDer<'_>],
            _server_name: &ServerName<'_>,
            _ocsp: &[u8],
            _now: UnixTime,
        ) -> Result<ServerCertVerified, rustls::Error> {
            if fingerprint_of(end_entity) == self.pinned {
                Ok(ServerCertVerified::assertion())
            } else {
                Err(rustls::Error::General("wrong fingerprint".into()))
            }
        }

        fn verify_tls12_signature(
            &self,
            _message: &[u8],
            _cert: &CertificateDer<'_>,
            _dss: &DigitallySignedStruct,
        ) -> Result<Valid, rustls::Error> {
            Err(rustls::Error::General("TLS 1.2 is not allowed".into()))
        }

        fn verify_tls13_signature(
            &self,
            message: &[u8],
            cert: &CertificateDer<'_>,
            dss: &DigitallySignedStruct,
        ) -> Result<Valid, rustls::Error> {
            verify_tls13_signature(message, cert, dss, &self.provider.signature_verification_algorithms)
        }

        fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
            self.provider.signature_verification_algorithms.supported_schemes()
        }
    }
}
