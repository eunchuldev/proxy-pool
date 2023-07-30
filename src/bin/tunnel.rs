use ttanggul::proxy;
use std::net::SocketAddr;

use clap::Parser;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Socket address to listen
    #[arg(short, long)]
    addr: SocketAddr,
}


#[tokio::main]
async fn main() -> Result<(), proxy::Error<std::io::Error>> {
    let args = Args::parse();

    proxy::start(args.addr, |_| async { Ok(None) }).await
}
