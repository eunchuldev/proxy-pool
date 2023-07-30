use std::net::SocketAddr;
use core::future::Future;
use bytes::Bytes;
use http::StatusCode;
use http_body_util::{combinators::BoxBody, BodyExt, Empty, Full};
use hyper::client::conn::http1::Builder;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::upgrade::Upgraded;
use hyper_util::rt::TokioIo;
pub use hyper::{Method, Request, Response};

use tokio::net::{TcpListener, TcpStream};

#[derive(thiserror::Error, Debug)]
pub enum Error<E> {
    #[error("Tcp Listener Errror: {0}")]
    TcpListenerError(std::io::Error),
    #[error("Tunneling Error: {0}")]
    TunnelingError(std::io::Error),
    #[error("Upgrade Error: {0}")]
    UpgradeError(hyper::Error),
    #[error("Request Builder Error: {0}")]
    RequestBuilderError(http::Error),
    #[error("Connection Failed: {0}")]
    ConnectionError(hyper::Error),
    #[error("Handshake Failed: {0}")]
    HandshakeError(hyper::Error),
    #[error("Fail to Send Request: {0}")]
    RequestError(hyper::Error),
    #[error("User Callback Error: {0}")]
    UserCallbackError(E),
}

pub async fn start<A, E, F, Fut>(
    addr: A, 
    middleware: F
) -> Result<(), Error<E>>
where 
    Fut: Future<Output = Result<Option<Response<BoxBody<Bytes, hyper::Error>>>, E>> + std::marker::Send,
    E: std::fmt::Display + std::fmt::Debug + Send + Sync + 'static,
    SocketAddr: From<A>, 
    F: FnOnce(&Request<hyper::body::Incoming>) -> Fut + std::marker::Send + 'static  + Clone + Sync,
{
    let addr = SocketAddr::from(addr);

    let listener = TcpListener::bind(addr).await.map_err(|err| Error::TcpListenerError(err))?;
    println!("Listening on http://{}", addr);

    loop {
        let (stream, _) = listener.accept().await.map_err(|err| Error::TcpListenerError(err))?;
        let io = TokioIo::new(stream);
        let middleware = middleware.clone();

        tokio::task::spawn(async move {
            if let Err(err) = http1::Builder::new()
                .preserve_header_case(true)
                .title_case_headers(true)
                .serve_connection(io, service_fn(|req| async move {
                    println!("req: {:?}", req);

                    match middleware(&req).await {
                        Ok(Some(res)) => return Ok(res),
                        Err(err) => return Err(Error::UserCallbackError(err)),
                        Ok(None) => ..,
                    };
                    match req.method().as_str() {
                        "CONNECT" => {
                            if let Some(addr) = host_addr(req.uri()) {
                                tokio::task::spawn(async move {
                                    match hyper::upgrade::on(req).await {
                                        Ok(upgraded) => {
                                            if let Err(e) = tunnel(upgraded, addr).await {
                                                eprintln!("server io error: {}", e);
                                            };
                                        }
                                        Err(e) => eprintln!("upgrade error: {}", e),
                                    }
                                });

                                Ok(Response::new(empty()))
                            } else {
                                eprintln!("CONNECT host is not socket addr: {:?}", req.uri());
                                Response::builder().status(StatusCode::BAD_REQUEST).body(full("CONNECT must be to a socket address")).map_err(|err| Error::<E>::RequestBuilderError(err))
                            }
                        }
                        /*
                           "" => {
                           eprintln!("CONNECT host is not socket addr: {:?}", req.uri());
                           let mut resp = Response::builder().status(BAD_REQUEST).new("CONNECT must be to a socket address");
                         *resp.status_mut() = http::StatusCode::BAD_REQUEST;

                         Ok(resp)
                         }
                         */
                        _ => {
                            let host = req.uri().host().expect("uri has no host");
                            let port = req.uri().port_u16().unwrap_or(80);
                            let addr = format!("{}:{}", host, port);

                            let stream = TcpStream::connect(addr).await.unwrap();
                            let io = TokioIo::new(stream);

                            let (mut sender, conn) = Builder::new()
                                .preserve_header_case(true)
                                .title_case_headers(true)
                                .handshake(io)
                                .await.map_err(|err| Error::HandshakeError(err))?;
                            tokio::task::spawn(async move {
                                if let Err(err) = conn.await {
                                    println!("Connection failed: {:?}", err);
                                }
                            });

                            let resp = sender.send_request(req).await.map_err(|err| Error::RequestError(err))?;
                            Ok(resp.map(|b| b.boxed()))
                        }
                    }
                }))
                .with_upgrades()
                .await
            {
                println!("Failed to serve connection: {:?}", err);
            }
        });
    }
}

/*
#[tokio::main]
async fn main() -> Result<(), Error> {
    let addr = SocketAddr::from(([0, 0, 0, 0], 8100));

    let listener = TcpListener::bind(addr).await.map_err(|err| Error::TcpListenerError(err))?;
    println!("Listening on http://{}", addr);

    loop {
        let (stream, _) = listener.accept().await.map_err(|err| Error::TcpListenerError(err))?;
        let io = TokioIo::new(stream);

        tokio::task::spawn(async move {
            if let Err(err) = http1::Builder::new()
                .preserve_header_case(true)
                .title_case_headers(true)
                .serve_connection(io, service_fn(proxy))
                .with_upgrades()
                .await
            {
                println!("Failed to serve connection: {:?}", err);
            }
        });
    }
}

async fn proxy(
    req: Request<hyper::body::Incoming>,
) -> Result<Response<BoxBody<Bytes, hyper::Error>>, Error> {
    println!("req: {:?}", req);

    match req.method().as_str() {
        "CONNECT" => {
            if let Some(addr) = host_addr(req.uri()) {
                tokio::task::spawn(async move {
                    match hyper::upgrade::on(req).await {
                        Ok(upgraded) => {
                            if let Err(e) = tunnel(upgraded, addr).await {
                                eprintln!("server io error: {}", e);
                            };
                        }
                        Err(e) => eprintln!("upgrade error: {}", e),
                    }
                });

                Ok(Response::new(empty()))
            } else {
                eprintln!("CONNECT host is not socket addr: {:?}", req.uri());
                Response::builder().status(StatusCode::BAD_REQUEST).body(full("CONNECT must be to a socket address")).map_err(|err| Error::RequestBuilderError(err))
            }
        }
        /*
        "" => {
            eprintln!("CONNECT host is not socket addr: {:?}", req.uri());
            let mut resp = Response::builder().status(BAD_REQUEST).new("CONNECT must be to a socket address");
            *resp.status_mut() = http::StatusCode::BAD_REQUEST;

            Ok(resp)
        }
        */
        _ => {
            let host = req.uri().host().expect("uri has no host");
            let port = req.uri().port_u16().unwrap_or(80);
            let addr = format!("{}:{}", host, port);

            let stream = TcpStream::connect(addr).await.unwrap();
            let io = TokioIo::new(stream);

            let (mut sender, conn) = Builder::new()
                .preserve_header_case(true)
                .title_case_headers(true)
                .handshake(io)
                .await.map_err(|err| Error::HandshakeError(err))?;
            tokio::task::spawn(async move {
                if let Err(err) = conn.await {
                    println!("Connection failed: {:?}", err);
                }
            });

            let resp = sender.send_request(req).await.map_err(|err| Error::RequestError(err))?;
            Ok(resp.map(|b| b.boxed()))
        }
    }
}
*/

fn host_addr(uri: &http::Uri) -> Option<String> {
    uri.authority().and_then(|auth| Some(auth.to_string()))
}

pub fn empty() -> BoxBody<Bytes, hyper::Error> {
    Empty::<Bytes>::new()
        .map_err(|never| match never {})
        .boxed()
}

pub fn full<T: Into<Bytes>>(chunk: T) -> BoxBody<Bytes, hyper::Error> {
    Full::new(chunk.into())
        .map_err(|never| match never {})
        .boxed()
}

async fn tunnel(upgraded: Upgraded, addr: String) -> std::io::Result<()> {
    let mut server = TcpStream::connect(addr).await?;
    let mut upgraded = TokioIo::new(upgraded);

    let (from_client, from_server) =
        tokio::io::copy_bidirectional(&mut upgraded, &mut server).await?;

    println!(
        "client wrote {} bytes and received {} bytes",
        from_client, from_server
    );

    Ok(())
}
