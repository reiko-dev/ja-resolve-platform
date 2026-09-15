/**
 * G2 — testes unitários do armazenamento privado das fotos de guincho.
 *
 * Exercitam o módulo real com imagens reais geradas pelo sharp: formato
 * detectado, teto de 5 MB, resize <= 1920 sem ampliar, EXIF normalizado,
 * nome UUID, permissões 0700/0600, atomicidade e recusa de traversal/symlink.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const storage = require('../../src/services/servicePhotoStorage');

jest.setTimeout(30000);

const { ServicePhotoError, MAX_PHOTO_BYTES, MAX_PHOTO_DIMENSION } = storage;

let root;
let previousRoot;
let fixtures = {};

function expectServicePhotoError(error, code, status) {
  expect(error).toBeInstanceOf(ServicePhotoError);
  expect(error.code).toBe(code);
  if (status !== undefined) {
    expect(error.status).toBe(status);
  }
}

async function listFiles(directory) {
  try {
    return await fs.promises.readdir(directory);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

beforeAll(async () => {
  previousRoot = process.env.SERVICE_PHOTO_STORAGE_DIR;
  root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'g2-photos-unit-'));
  process.env.SERVICE_PHOTO_STORAGE_DIR = root;

  fixtures.jpegLarge = await sharp({
    create: { width: 3000, height: 1000, channels: 3, background: { r: 12, g: 34, b: 56 } },
  })
    .jpeg()
    .toBuffer();

  fixtures.jpegSmall = await sharp({
    create: { width: 100, height: 50, channels: 3, background: { r: 200, g: 10, b: 10 } },
  })
    .jpeg()
    .toBuffer();

  fixtures.webpLarge = await sharp({
    create: { width: 2400, height: 1200, channels: 3, background: { r: 5, g: 90, b: 140 } },
  })
    .webp()
    .toBuffer();

  fixtures.png = await sharp({
    create: { width: 40, height: 40, channels: 3, background: { r: 1, g: 2, b: 3 } },
  })
    .png()
    .toBuffer();

  fixtures.gif = await sharp({
    create: { width: 30, height: 30, channels: 3, background: { r: 9, g: 9, b: 9 } },
  })
    .gif()
    .toBuffer();

  fixtures.svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#f00"/></svg>'
  );

  fixtures.pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
  fixtures.garbage = Buffer.from('isto não é uma imagem');

  const exifSource = await sharp({
    create: { width: 60, height: 120, channels: 3, background: { r: 40, g: 80, b: 120 } },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  fixtures.exifJpeg = exifSource;

  const exifCheck = await sharp(exifSource).metadata();
  expect(exifCheck.orientation).toBe(6);
});

afterAll(async () => {
  if (previousRoot === undefined) {
    delete process.env.SERVICE_PHOTO_STORAGE_DIR;
  } else {
    process.env.SERVICE_PHOTO_STORAGE_DIR = previousRoot;
  }
  await fs.promises.rm(root, { recursive: true, force: true });
});

describe('G2 storage — configuração da raiz privada', () => {
  test('raiz ausente falha em 503 na chamada, não no import', () => {
    const saved = process.env.SERVICE_PHOTO_STORAGE_DIR;
    delete process.env.SERVICE_PHOTO_STORAGE_DIR;

    try {
      expect(() => storage.getStorageRoot()).toThrow(ServicePhotoError);
      try {
        storage.getStorageRoot();
      } catch (error) {
        expectServicePhotoError(error, 'photo_storage_not_configured', 503);
      }
    } finally {
      process.env.SERVICE_PHOTO_STORAGE_DIR = saved;
    }

    expect(storage.getStorageRoot()).toBe(root);
  });

  test('URL pública é caminho autenticado da API, nunca filesystem', () => {
    expect(storage.buildPhotoUrl(42, 'pickup')).toBe(
      '/api/upload/emergency-requests/42/photos/pickup'
    );
    expect(() => storage.buildPhotoUrl(42, 'engine')).toThrow(ServicePhotoError);
    expect(storage.buildPhotoUrl(42, 'pickup')).not.toContain(root);
  });
});

describe('G2 storage — formato real, tamanho e normalização', () => {
  test('JPEG real é aceito, redimensionado para 1920 sem ampliar e sem metadados', async () => {
    const processed = await storage.processServicePhotoPayload({
      image: fixtures.jpegLarge.toString('base64'),
      filename: 'Frente do veiculo.jpg',
      mimeType: 'image/jpeg',
      photoType: 'pickup',
    });

    expect(processed.format).toBe('jpeg');
    expect(processed.mimeType).toBe('image/jpeg');
    expect(processed.width).toBe(MAX_PHOTO_DIMENSION);
    expect(processed.height).toBe(640);
    expect(processed.sizeBytes).toBe(processed.buffer.length);
    expect(processed.sizeBytes).toBeLessThanOrEqual(MAX_PHOTO_BYTES);
    expect(processed.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(processed.originalFilename).toBe('Frente do veiculo.jpg');
    expect(processed.sourceSizeBytes).toBe(fixtures.jpegLarge.length);

    const outputMetadata = await sharp(processed.buffer).metadata();
    expect(outputMetadata.format).toBe('jpeg');
    expect(outputMetadata.exif).toBeUndefined();
  });

  test('WebP real é aceito e redimensionado', async () => {
    const processed = await storage.processServicePhotoPayload({
      image: fixtures.webpLarge.toString('base64'),
      filename: 'traseira.webp',
      mimeType: 'image/webp',
      photoType: 'delivery',
    });

    expect(processed.format).toBe('webp');
    expect(processed.width).toBe(MAX_PHOTO_DIMENSION);
    expect(processed.height).toBe(960);
  });

  test('imagem pequena não é ampliada', async () => {
    const processed = await storage.processServicePhotoPayload({
      image: fixtures.jpegSmall.toString('base64'),
      filename: 'pequena.jpg',
      mimeType: 'image/jpeg',
      photoType: 'pickup',
    });

    expect(processed.width).toBe(100);
    expect(processed.height).toBe(50);
  });

  test('orientação EXIF é aplicada e o EXIF é removido na saída', async () => {
    const processed = await storage.processServicePhotoPayload({
      image: fixtures.exifJpeg.toString('base64'),
      filename: 'girada.jpg',
      mimeType: 'image/jpeg',
      photoType: 'pickup',
    });

    expect(processed.width).toBe(120);
    expect(processed.height).toBe(60);

    const outputMetadata = await sharp(processed.buffer).metadata();
    expect(outputMetadata.orientation).toBeUndefined();
    expect(outputMetadata.exif).toBeUndefined();
  });

  test('data URL base64 válida é aceita quando o mime confere', async () => {
    const processed = await storage.processServicePhotoPayload({
      image: `data:image/jpeg;base64,${fixtures.jpegSmall.toString('base64')}`,
      filename: 'data-url.jpg',
      mimeType: 'image/jpeg',
      photoType: 'pickup',
    });

    expect(processed.format).toBe('jpeg');
  });

  test('PNG/GIF/SVG declarados como JPEG são recusados por divergência real', async () => {
    for (const [name, buffer] of [
      ['foto.png', fixtures.png],
      ['foto.gif', fixtures.gif],
      ['foto.svg', fixtures.svg],
    ]) {
      await expect(
        storage.processServicePhotoPayload({
          image: buffer.toString('base64'),
          filename: name,
          mimeType: 'image/jpeg',
          photoType: 'pickup',
        })
      ).rejects.toMatchObject({ code: 'mime_mismatch' });
    }
  });

  test('mimeType fora do contrato é recusado como unsupported_mime_type', async () => {
    await expect(
      storage.processServicePhotoPayload({
        image: fixtures.png.toString('base64'),
        filename: 'foto.png',
        mimeType: 'image/png',
        photoType: 'pickup',
      })
    ).rejects.toMatchObject({ code: 'unsupported_mime_type' });
  });

  test('PDF, lixo e base64 inválido são recusados', async () => {
    await expect(
      storage.processServicePhotoPayload({
        image: fixtures.pdf.toString('base64'),
        filename: 'doc.pdf',
        mimeType: 'image/jpeg',
        photoType: 'pickup',
      })
    ).rejects.toMatchObject({ code: 'invalid_image' });

    await expect(
      storage.processServicePhotoPayload({
        image: fixtures.garbage.toString('base64'),
        filename: 'x.jpg',
        mimeType: 'image/jpeg',
        photoType: 'pickup',
      })
    ).rejects.toMatchObject({ code: 'invalid_image' });

    for (const invalid of ['', 'não-é-base64!!', 'AAAAA', 'data:image/jpeg;base64,###']) {
      await expect(
        storage.processServicePhotoPayload({
          image: invalid,
          filename: 'x.jpg',
          mimeType: 'image/jpeg',
          photoType: 'pickup',
        })
      ).rejects.toMatchObject({ code: 'invalid_base64' });
    }
  });

  test('data URL com mime divergente do mimeType é recusada', async () => {
    await expect(
      storage.processServicePhotoPayload({
        image: `data:image/png;base64,${fixtures.jpegSmall.toString('base64')}`,
        filename: 'x.jpg',
        mimeType: 'image/jpeg',
        photoType: 'pickup',
      })
    ).rejects.toMatchObject({ code: 'mime_mismatch' });
  });

  test('extensão divergente do conteúdo real é recusada', async () => {
    await expect(
      storage.processServicePhotoPayload({
        image: fixtures.jpegSmall.toString('base64'),
        filename: 'foto.webp',
        mimeType: 'image/jpeg',
        photoType: 'pickup',
      })
    ).rejects.toMatchObject({ code: 'mime_mismatch' });
  });

  test('payload acima de 5 MB é recusado antes de decodificar/processar', async () => {
    const oversized = Buffer.alloc(MAX_PHOTO_BYTES + 1024, 7);

    await expect(
      storage.processServicePhotoPayload({
        image: oversized.toString('base64'),
        filename: 'grande.jpg',
        mimeType: 'image/jpeg',
        photoType: 'pickup',
      })
    ).rejects.toMatchObject({ code: 'photo_too_large', status: 400 });
  });

  test('photo_type inválido é recusado', async () => {
    await expect(
      storage.processServicePhotoPayload({
        image: fixtures.jpegSmall.toString('base64'),
        filename: 'x.jpg',
        mimeType: 'image/jpeg',
        photoType: 'engine',
      })
    ).rejects.toMatchObject({ code: 'invalid_photo_type' });
  });

  test('filename com traversal, separador, byte nulo ou vazio é recusado', async () => {
    for (const filename of ['../etc/passwd', 'a/b.jpg', 'a\\b.jpg', '', '   ', 'x\u0000.jpg', '.', '..']) {
      await expect(
        storage.processServicePhotoPayload({
          image: fixtures.jpegSmall.toString('base64'),
          filename,
          mimeType: 'image/jpeg',
          photoType: 'pickup',
        })
      ).rejects.toMatchObject({ code: 'invalid_filename' });
    }
  });
});

describe('G2 storage — escrita privada, atômica e sem traversal', () => {
  async function processedFixture(photoType = 'pickup') {
    return storage.processServicePhotoPayload({
      image: fixtures.jpegSmall.toString('base64'),
      filename: 'foto.jpg',
      mimeType: 'image/jpeg',
      photoType,
    });
  }

  test('grava arquivo com nome UUID, permissões 0700/0600 e sem temporário', async () => {
    const processed = await processedFixture('pickup');
    const stored = await storage.storeServicePhoto({ requestId: 101, photoType: 'pickup', processed });

    expect(stored.storageKey).toMatch(/^101\/pickup-[0-9a-f-]{36}\.jpg$/);
    expect(stored.storageKey).not.toContain(root);
    expect(stored.absolutePath.startsWith(root + path.sep)).toBe(true);

    const directoryStat = await fs.promises.lstat(path.join(root, '101'));
    expect(directoryStat.isDirectory()).toBe(true);
    expect(directoryStat.mode & 0o777).toBe(0o700);

    const fileStat = await fs.promises.lstat(stored.absolutePath);
    expect(fileStat.isFile()).toBe(true);
    expect(fileStat.mode & 0o777).toBe(0o600);
    expect(fileStat.size).toBe(processed.buffer.length);

    const onDisk = await fs.promises.readFile(stored.absolutePath);
    expect(onDisk.equals(processed.buffer)).toBe(true);

    const entries = await listFiles(path.join(root, '101'));
    expect(entries).toEqual([path.basename(stored.absolutePath)]);
    expect(entries.some(entry => entry.endsWith('.tmp'))).toBe(false);
  });

  test('duas gravações do mesmo tipo geram arquivos distintos (sem sobrescrever)', async () => {
    const processed = await processedFixture('delivery');
    const first = await storage.storeServicePhoto({ requestId: 102, photoType: 'delivery', processed });
    const second = await storage.storeServicePhoto({ requestId: 102, photoType: 'delivery', processed });

    expect(first.storageKey).not.toBe(second.storageKey);
    expect(await listFiles(path.join(root, '102'))).toHaveLength(2);
  });

  test('requestId inválido não cria diretório', async () => {
    const processed = await processedFixture('pickup');

    for (const requestId of ['abc', '0', '../1', '1/2', '']) {
      await expect(
        storage.storeServicePhoto({ requestId, photoType: 'pickup', processed })
      ).rejects.toMatchObject({ code: 'invalid_request_id' });
    }
  });

  test('diretório do pedido que é symlink é recusado e nada é escrito fora da raiz', async () => {
    const outside = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'g2-photos-outside-'));
    await fs.promises.symlink(outside, path.join(root, '103'));

    const processed = await processedFixture('pickup');

    try {
      await expect(
        storage.storeServicePhoto({ requestId: 103, photoType: 'pickup', processed })
      ).rejects.toMatchObject({ code: 'unsafe_storage_path', status: 500 });

      expect(await listFiles(outside)).toEqual([]);
    } finally {
      await fs.promises.rm(path.join(root, '103'), { force: true });
      await fs.promises.rm(outside, { recursive: true, force: true });
    }
  });

  test('leitura devolve os bytes gravados e chave inexistente é photo_not_found', async () => {
    const processed = await processedFixture('pickup');
    const stored = await storage.storeServicePhoto({ requestId: 104, photoType: 'pickup', processed });

    const read = await storage.readStoredPhoto(stored.storageKey);
    expect(read.buffer.equals(processed.buffer)).toBe(true);
    expect(read.sizeBytes).toBe(processed.buffer.length);

    await expect(
      storage.readStoredPhoto('104/pickup-00000000-0000-0000-0000-000000000000.jpg')
    ).rejects.toMatchObject({ code: 'photo_not_found', status: 500 });
  });

  test('chaves com traversal, formato inesperado ou symlink são recusadas', async () => {
    const invalidKeys = [
      '../104/x.jpg',
      '104/../../etc/passwd',
      '/etc/passwd',
      '104/evil.sh',
      '104/pickup-00000000-0000-0000-0000-000000000000.exe',
      'pickup-00000000-0000-0000-0000-000000000000.jpg',
      '',
      null,
    ];

    for (const storageKey of invalidKeys) {
      await expect(storage.resolveStoredPhotoPath(storageKey)).rejects.toMatchObject({
        code: 'invalid_storage_key',
        status: 500,
      });
    }

    const outside = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'g2-photos-link-'));
    const outsideFile = path.join(outside, 'segredo.jpg');
    await fs.promises.writeFile(outsideFile, 'segredo');

    const linkedKey = '105/pickup-11111111-1111-1111-1111-111111111111.jpg';
    await fs.promises.mkdir(path.join(root, '105'), { recursive: true, mode: 0o700 });
    await fs.promises.symlink(outsideFile, path.join(root, linkedKey));

    try {
      await expect(storage.resolveStoredPhotoPath(linkedKey)).rejects.toMatchObject({
        code: 'unsafe_storage_path',
        status: 500,
      });
    } finally {
      await fs.promises.rm(path.join(root, '105'), { recursive: true, force: true });
      await fs.promises.rm(outside, { recursive: true, force: true });
    }
  });

  test('removeStoredPhoto apaga o arquivo e é idempotente', async () => {
    const processed = await processedFixture('pickup');
    const stored = await storage.storeServicePhoto({ requestId: 106, photoType: 'pickup', processed });

    expect(await storage.removeStoredPhoto(stored.storageKey)).toBe(true);
    expect(await listFiles(path.join(root, '106'))).toEqual([]);
    expect(await storage.removeStoredPhoto(stored.storageKey)).toBe(false);
    expect(await storage.removeStoredPhoto('../fora.jpg')).toBe(false);
  });
});

describe('G2 storage — chave persistida restrita a pickup/delivery', () => {
  const uuid = '11111111-2222-3333-4444-555555555555';

  test('aceita apenas <id>/<pickup|delivery>-<uuid>.<jpg|webp>', async () => {
    const requestId = 140;
    const requestDirectory = path.join(root, String(requestId));
    await fs.promises.mkdir(requestDirectory, { recursive: true, mode: 0o700 });

    try {
      const validKeys = [
        `${requestId}/pickup-${uuid}.jpg`,
        `${requestId}/delivery-${uuid}.webp`,
      ];

      for (const storageKey of validKeys) {
        const absolutePath = path.join(root, ...storageKey.split('/'));
        await fs.promises.writeFile(absolutePath, fixtures.jpegSmall, { mode: 0o600 });

        const resolved = await storage.resolveStoredPhotoPath(storageKey);
        expect(resolved.absolutePath).toBe(absolutePath);
      }

      const invalidKeys = [
        `${requestId}/engine-${uuid}.jpg`,
        `${requestId}/pickupx-${uuid}.jpg`,
        `${requestId}/xpickup-${uuid}.jpg`,
        `${requestId}/PICKUP-${uuid}.jpg`,
        `${requestId}/pickup-${uuid}.png`,
        `${requestId}/pickup-${uuid}`,
        `${requestId}/pickup-${uuid.slice(0, 35)}.jpg`,
        `0/pickup-${uuid}.jpg`,
        `-1/pickup-${uuid}.jpg`,
      ];

      for (const storageKey of invalidKeys) {
        await expect(storage.resolveStoredPhotoPath(storageKey)).rejects.toMatchObject({
          code: 'invalid_storage_key',
          status: 500,
        });
      }
    } finally {
      await fs.promises.rm(requestDirectory, { recursive: true, force: true });
    }
  });

  test('prefixo arbitrário não é chave do contrato nem vira referência', () => {
    expect(storage.STORAGE_KEY_PATTERN.test(`104/engine-${uuid}.jpg`)).toBe(false);
    expect(storage.STORAGE_KEY_PATTERN.test(`104/pickup-${uuid}.jpg`)).toBe(true);
    expect(storage.STORAGE_KEY_PATTERN.test(`104/delivery-${uuid}.webp`)).toBe(true);
    expect(storage.STORAGE_KEY_PATTERN.test(`104/pickup-${uuid}.jpeg`)).toBe(false);
  });
});

describe('G2 storage — reconciliação de órfãos', () => {
  let reconcileRoot;

  async function writeKey(storageKey, { base = reconcileRoot, content = 'photo' } = {}) {
    const absolutePath = path.join(base, ...storageKey.split('/'));
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
    await fs.promises.writeFile(absolutePath, content, { mode: 0o600 });
    return absolutePath;
  }

  beforeEach(async () => {
    reconcileRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'g2-photos-reconcile-'));
  });

  afterEach(async () => {
    await fs.promises.rm(reconcileRoot, { recursive: true, force: true });
  });

  test('dry-run lista órfãos sem remover; apply remove só os sem referência', async () => {
    const referencedKey = `150/pickup-${crypto.randomUUID()}.jpg`;
    const orphanKey = `150/delivery-${crypto.randomUUID()}.webp`;
    const otherOrphanKey = `151/pickup-${crypto.randomUUID()}.jpg`;
    const nonContractKey = `150/engine-${crypto.randomUUID()}.jpg`;

    const referencedPath = await writeKey(referencedKey);
    const orphanPath = await writeKey(orphanKey);
    const otherOrphanPath = await writeKey(otherOrphanKey);
    const nonContractPath = await writeKey(nonContractKey);
    await fs.promises.writeFile(path.join(reconcileRoot, '150', '.tmp-foto'), 'tmp', { mode: 0o600 });

    const listed = await storage.listStoredPhotoFiles({ root: reconcileRoot });
    expect(listed.map(file => file.storageKey).sort()).toEqual(
      [referencedKey, orphanKey, otherOrphanKey].sort()
    );
    expect(listed.every(file => path.isAbsolute(file.absolutePath))).toBe(true);

    const dryRun = await storage.reconcileOrphanServicePhotos({
      references: { keys: [referencedKey] },
      root: reconcileRoot,
      dryRun: true,
    });
    expect(dryRun).toMatchObject({
      dry_run: true,
      scanned: 3,
      referenced: 1,
      orphaned: 2,
      removed: 0,
      failed: 0,
    });
    expect(dryRun.orphan_keys.sort()).toEqual([orphanKey, otherOrphanKey].sort());
    expect(fs.existsSync(orphanPath)).toBe(true);
    expect(fs.existsSync(otherOrphanPath)).toBe(true);

    const applied = await storage.reconcileOrphanServicePhotos({
      references: { keys: [referencedKey] },
      root: reconcileRoot,
      dryRun: false,
    });
    expect(applied).toMatchObject({ dry_run: false, removed: 2, failed: 0 });
    expect(fs.existsSync(orphanPath)).toBe(false);
    expect(fs.existsSync(otherOrphanPath)).toBe(false);
    expect(fs.existsSync(referencedPath)).toBe(true);
    expect(fs.existsSync(nonContractPath)).toBe(true);
    expect(fs.existsSync(path.join(reconcileRoot, '150', '.tmp-foto'))).toBe(true);
  });

  test('prefixo <id>/<tipo>- protege arquivos sem metadata legível', async () => {
    const protectedKey = `160/pickup-${crypto.randomUUID()}.jpg`;
    const orphanKey = `161/pickup-${crypto.randomUUID()}.jpg`;
    const protectedPath = await writeKey(protectedKey);
    const orphanPath = await writeKey(orphanKey);

    const applied = await storage.reconcileOrphanServicePhotos({
      references: { prefixes: ['160/pickup-'] },
      root: reconcileRoot,
      dryRun: false,
    });

    expect(applied).toMatchObject({ scanned: 2, referenced: 1, orphaned: 1, removed: 1, failed: 0 });
    expect(fs.existsSync(protectedPath)).toBe(true);
    expect(fs.existsSync(orphanPath)).toBe(false);
  });

  test('nunca segue symlink nem apaga arquivo fora da raiz', async () => {
    const outsideRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'g2-photos-outside-'));
    const outsideKey = `170/pickup-${crypto.randomUUID()}.jpg`;
    const outsidePath = await writeKey(outsideKey, { base: outsideRoot, content: 'segredo' });
    const symlinkTarget = path.join(outsideRoot, 'alvo.jpg');
    await fs.promises.writeFile(symlinkTarget, 'segredo', { mode: 0o600 });

    try {
      await fs.promises.symlink(outsideRoot, path.join(reconcileRoot, '170'));
      await fs.promises.mkdir(path.join(reconcileRoot, '171'), { recursive: true, mode: 0o700 });
      await fs.promises.symlink(
        symlinkTarget,
        path.join(reconcileRoot, '171', `pickup-${crypto.randomUUID()}.jpg`)
      );

      const listed = await storage.listStoredPhotoFiles({ root: reconcileRoot });
      expect(listed).toEqual([]);

      const applied = await storage.reconcileOrphanServicePhotos({
        references: {},
        root: reconcileRoot,
        dryRun: false,
      });
      expect(applied).toMatchObject({ scanned: 0, orphaned: 0, removed: 0, failed: 0 });
      expect(fs.existsSync(outsidePath)).toBe(true);
      expect(fs.existsSync(symlinkTarget)).toBe(true);
    } finally {
      await fs.promises.rm(outsideRoot, { recursive: true, force: true });
    }
  });

  test('raiz symlink é recusada e raiz ausente devolve varredura vazia', async () => {
    const linkRoot = path.join(os.tmpdir(), `g2-photos-rootlink-${crypto.randomUUID()}`);

    try {
      await fs.promises.symlink(reconcileRoot, linkRoot);

      await expect(storage.listStoredPhotoFiles({ root: linkRoot })).rejects.toMatchObject({
        code: 'unsafe_storage_path',
        status: 500,
      });
    } finally {
      await fs.promises.rm(linkRoot, { force: true });
    }

    const report = await storage.reconcileOrphanServicePhotos({
      references: {},
      root: path.join(reconcileRoot, 'inexistente'),
      dryRun: false,
    });
    expect(report).toMatchObject({ scanned: 0, orphaned: 0, removed: 0, failed: 0 });
    expect(report.orphan_keys).toEqual([]);
  });
});
