import { BlobSASPermissions, BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters } from "@azure/storage-blob";

function parseConnectionString(conn: string) {
  const parts = conn.split(";").reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split("=");
    if (key && value) acc[key] = value;
    return acc;
  }, {});
  return {
    accountName: parts.AccountName,
    accountKey: parts.AccountKey
  };
}

function getContainerClient() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const container = process.env.AZURE_STORAGE_CONTAINER;
  if (!conn || !container) {
    throw new Error("Missing Azure storage configuration");
  }
  const service = BlobServiceClient.fromConnectionString(conn);
  return service.getContainerClient(container);
}

export async function uploadAttachment(params: {
  blobName: string;
  contentType: string;
  data: Buffer;
}) {
  const client = getContainerClient();
  await client.createIfNotExists();
  const blob = client.getBlockBlobClient(params.blobName);
  await blob.uploadData(params.data, {
    blobHTTPHeaders: { blobContentType: params.contentType }
  });
  return blob.url;
}

export function getAttachmentSasUrl(blobName: string, expiresMinutes = 60 * 24) {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const container = process.env.AZURE_STORAGE_CONTAINER;
  if (!conn || !container) {
    throw new Error("Missing Azure storage configuration");
  }
  const { accountName, accountKey } = parseConnectionString(conn);
  if (!accountName || !accountKey) {
    throw new Error("Invalid Azure connection string");
  }
  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const sas = generateBlobSASQueryParameters(
    {
      containerName: container,
      blobName,
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: new Date(Date.now() + expiresMinutes * 60 * 1000)
    },
    credential
  ).toString();
  return `https://${accountName}.blob.core.windows.net/${container}/${blobName}?${sas}`;
}

export async function getContainerStatus() {
  const client = getContainerClient();
  const exists = await client.exists();
  if (!exists) {
    return { ok: false };
  }
  const props = await client.getProperties();
  return { ok: true, lastModified: props.lastModified?.toISOString() };
}
