#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = app_config::ProductivityConfig::load()?;
    data_service::run(config).await?;
    Ok(())
}
