import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Paper,
  Divider,
  Button,
  Alert,
  Chip,
  IconButton,
  Tooltip,
  Switch,
  FormControlLabel,
  LinearProgress,
} from '@mui/material';
import {
  Add,
  Remove,
  Upload,
  Delete,
  Info,
  CloudUpload,
  CheckCircle,
  Error,
} from '@mui/icons-material';
import { API_KEYS, API_ENDPOINTS } from '../config/apiKeys';
import uploadService from '../services/uploadService';

interface PartnerFormProps {
  partnerType: 'mechanic' | 'motoboy' | 'gas_station' | 'auto_parts' | 'tow';
  formData: any;
  onChange: (data: any) => void;
  errors?: any;
}

const PartnerForm: React.FC<PartnerFormProps> = ({
  partnerType,
  formData,
  onChange,
  errors
}) => {
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [uploadError, setUploadError] = useState('');

  // Documentos obrigatórios por tipo
  const getRequiredDocuments = () => {
    const baseDocuments = ['RG/CPF', 'Comprovante Residência'];
    
    switch (partnerType) {
      case 'mechanic':
        return [...baseDocuments, 'CNH', 'Certificados'];
      case 'motoboy':
        return [...baseDocuments, 'CNH', 'CRLV'];
      case 'tow':
        return [...baseDocuments, 'CNH', 'CRLV'];
      case 'gas_station':
        return [...baseDocuments, 'Licença Comercial'];
      case 'auto_parts':
        return [...baseDocuments, 'Licença Comercial'];
      default:
        return baseDocuments;
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, documentType: string) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadError('');

    try {
      // Simular upload (na implementação real, aqui faria o upload para o backend)
      const newFiles = Array.from(files).map(file => ({
        name: file.name,
        type: documentType,
        size: file.size,
        status: 'pending',
        uploadDate: new Date(),
        url: URL.createObjectURL(file)
      }));

      setUploadedFiles(prev => [...prev, ...newFiles]);
      
      // Limpar o input
      event.target.value = '';
      
    } catch (error) {
      setUploadError('Erro ao fazer upload dos documentos');
      console.error('Erro no upload:', error);
    } finally {
      setUploading(false);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;
    onChange({
      ...formData,
      [name]: newValue
    });
  };

  const handleCepSearch = async () => {
    const cep = formData.cep?.replace(/\D/g, '');
    if (!cep || cep.length !== 8) return;

    setCepLoading(true);
    setCepError('');

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();

      if (data.erro) {
        setCepError('CEP não encontrado');
        return;
      }

      onChange({
        ...formData,
        street: data.logradouro,
        neighborhood: data.bairro,
        city: data.localidade,
        state: data.uf,
        latitude: -23.5505, // Coordenadas aproximadas de São Paulo (placeholder)
        longitude: -46.6333,
      });

      // Buscar coordenadas reais usando Google Maps API (se disponível)
      if (data.logradouro && data.localidade) {
        try {
          const geocodeResponse = await fetch(
            `${API_ENDPOINTS.GOOGLE_GEOCODING}?address=${encodeURIComponent(`${data.logradouro}, ${data.localidade}, ${data.uf}`)}&key=${API_KEYS.GOOGLE_MAPS}`
          );
          const geocodeData = await geocodeResponse.json();
          
          if (geocodeData.results && geocodeData.results[0]) {
            const location = geocodeData.results[0].geometry.location;
            onChange((prev: any) => ({
              ...prev,
              latitude: location.lat,
              longitude: location.lng,
            }));
          }
        } catch (error) {
          console.log('Não foi possível obter coordenadas precisas');
        }
      }
    } catch (error) {
      setCepError('Erro ao buscar CEP');
    } finally {
      setCepLoading(false);
    }
  };

  // Campos base para todos os tipos
  const baseFields = (
    <>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="CEP"
          name="cep"
          value={formData.cep || ''}
          onChange={handleChange}
          onBlur={handleCepSearch}
          error={!!errors?.cep}
          helperText={errors?.cep}
          required
        />
        {cepLoading && <Typography variant="caption" color="primary">Buscando CEP...</Typography>}
        {cepError && <Typography variant="caption" color="error">{cepError}</Typography>}
      </Grid>
      
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Número"
          name="address_number"
          value={formData.address_number || ''}
          onChange={handleChange}
          error={!!errors?.address_number}
          helperText={errors?.address_number}
          required
        />
      </Grid>
      
      <Grid item xs={12}>
        <TextField
          fullWidth
          label="Complemento"
          name="address_complement"
          value={formData.address_complement || ''}
          onChange={handleChange}
        />
      </Grid>
      
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Rua/Av"
          name="street"
          value={formData.street || ''}
          onChange={handleChange}
          required
          disabled={cepLoading}
        />
      </Grid>
      
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Bairro"
          name="neighborhood"
          value={formData.neighborhood || ''}
          onChange={handleChange}
          required
          disabled={cepLoading}
        />
      </Grid>
      
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Cidade"
          name="city"
          value={formData.city || ''}
          onChange={handleChange}
          required
          disabled={cepLoading}
        />
      </Grid>
      
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Estado"
          name="state"
          value={formData.state || ''}
          onChange={handleChange}
          required
          disabled={cepLoading}
        />
      </Grid>

      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Latitude (preenchido automaticamente)"
          name="latitude"
          value={formData.latitude || ''}
          onChange={handleChange}
          disabled
        />
      </Grid>
      
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Longitude (preenchido automaticamente)"
          name="longitude"
          value={formData.longitude || ''}
          onChange={handleChange}
          disabled
        />
      </Grid>
    </>
  );

  // Campos específicos por tipo
  const typeSpecificFields = () => {
    switch (partnerType) {
      case 'mechanic':
        return (
          <>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                🧰 Dados do Mecânico
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Anos de Experiência"
                name="experience_years"
                type="number"
                value={formData.experience_years || ''}
                onChange={handleChange}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Taxa Horária (R$)"
                name="hourly_rate"
                type="number"
                value={formData.hourly_rate || ''}
                onChange={handleChange}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Especialidades"
                name="specialties"
                value={formData.specialties?.join(', ') || ''}
                onChange={(e) => handleChange({
                  target: {
                    name: 'specialties',
                    value: e.target.value.split(',').map(s => s.trim()).filter(s => s)
                  }
                })}
                helperText="Separe por vírgula: Motor, Freios, Suspensão..."
              />
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Serviços Oferecidos
              </Typography>
              <Box display="flex" gap={1} flexWrap="wrap">
                <FormControlLabel
                  control={<Switch checked={formData.emergency_service || false} onChange={handleChange} name="emergency_service" />}
                  label="Serviço de Emergência"
                />
                <FormControlLabel
                  control={<Switch checked={formData.home_service || false} onChange={handleChange} name="home_service" />}
                  label="Atendimento Domiciliar"
                />
                <FormControlLabel
                  control={<Switch checked={formData.workshop_service || false} onChange={handleChange} name="workshop_service" />}
                  label="Oficina Própria"
                />
              </Box>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Informações sobre Seguro"
                name="insurance_info"
                value={formData.insurance_info || ''}
                onChange={handleChange}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Informações sobre Garantia"
                name="warranty_info"
                value={formData.warranty_info || ''}
                onChange={handleChange}
              />
            </Grid>
          </>
        );

      case 'motoboy':
        return (
          <>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                🏍️ Dados do Motoboy
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="CNH Número"
                name="cnh_number"
                value={formData.cnh_number || ''}
                onChange={handleChange}
                required
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Categoria CNH</InputLabel>
                <Select
                  name="cnh_category"
                  value={formData.cnh_category || ''}
                  onChange={handleChange}
                  label="Categoria CNH"
                  required
                >
                  <MenuItem value="A">A</MenuItem>
                  <MenuItem value="B">B</MenuItem>
                  <MenuItem value="AB">AB</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Placa da Moto"
                name="license_plate"
                value={formData.license_plate || ''}
                onChange={handleChange}
                required
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Tipo de Veículo</InputLabel>
                <Select
                  name="vehicle_type"
                  value={formData.vehicle_type || ''}
                  onChange={handleChange}
                  label="Tipo de Veículo"
                >
                  <MenuItem value="motorcycle">Moto</MenuItem>
                  <MenuItem value="scooter">Scooter</MenuItem>
                  <MenuItem value="electric">Elétrica</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Taxa de Entrega (R$)"
                name="delivery_fee"
                type="number"
                value={formData.delivery_fee || ''}
                onChange={handleChange}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Raio de Atendimento (km)"
                name="delivery_radius"
                type="number"
                value={formData.delivery_radius || ''}
                onChange={handleChange}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Tempo Médio de Entrega (minutos)"
                name="delivery_time_minutes"
                type="number"
                value={formData.delivery_time_minutes || ''}
                onChange={handleChange}
              />
            </Grid>
          </>
        );

      case 'gas_station':
        return (
          <>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                ⛽ Dados do Posto de Combustível
              </Typography>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Bandeira"
                name="fuel_brand"
                value={formData.fuel_brand || ''}
                onChange={handleChange}
                helperText="Ex: Petrobras, Shell, Ipiranga..."
              />
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Tipos de Combustível
              </Typography>
              <Box display="flex" gap={1} flexWrap="wrap">
                {['Gasolina', 'Etanol', 'Diesel', 'GNV'].map((fuel: string) => (
                  <FormControlLabel
                    key={fuel}
                    control={
                      <Switch
                        checked={formData.fuel_types?.includes(fuel) || false}
                        onChange={(e) => {
                          const current = formData.fuel_types || [];
                          const updated = e.target.checked
                            ? [...current, fuel]
                            : current.filter((f: string) => f !== fuel);
                          handleChange({
                            target: { name: 'fuel_types', value: updated }
                          });
                        }}
                      />
                    }
                    label={fuel}
                  />
                ))}
              </Box>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Serviços Adicionais"
                name="additional_services"
                value={formData.additional_services || ''}
                onChange={handleChange}
                helperText="Ex: Troca de óleo, Lavagem, Calibragem..."
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Horário de Funcionamento"
                name="working_hours"
                value={formData.working_hours || ''}
                onChange={handleChange}
                helperText="Ex: Seg-Sex 6:00-22:00, Sáb 7:00-20:00"
              />
            </Grid>
          </>
        );

      case 'auto_parts':
        return (
          <>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                🔧 Dados da Auto Peças
              </Typography>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Categorias de Peças"
                name="store_categories"
                value={formData.store_categories?.join(', ') || ''}
                onChange={(e) => handleChange({
                  target: {
                    name: 'store_categories',
                    value: e.target.value.split(',').map(s => s.trim()).filter(s => s)
                  }
                })}
                helperText="Separe por vírgula: Motor, Freios, Suspensão, Elétrica..."
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Valor Mínimo de Pedido (R$)"
                name="min_order_value"
                type="number"
                value={formData.min_order_value || ''}
                onChange={handleChange}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Taxa de Entrega (R$)"
                name="delivery_fee"
                type="number"
                value={formData.delivery_fee || ''}
                onChange={handleChange}
              />
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Serviços
              </Typography>
              <Box display="flex" gap={1} flexWrap="wrap">
                <FormControlLabel
                  control={<Switch checked={formData.has_delivery || false} onChange={handleChange} name="has_delivery" />}
                  label="Realiza Entregas"
                />
                <FormControlLabel
                  control={<Switch checked={formData.workshop_service || false} onChange={handleChange} name="workshop_service" />}
                  label="Oficina Própria"
                />
              </Box>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Marcas Representadas"
                name="represented_brands"
                value={formData.represented_brands || ''}
                onChange={handleChange}
                helperText="Separe por vírgula: Bosch, NGK, Mahle..."
              />
            </Grid>
          </>
        );

      case 'tow':
        return (
          <>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                🚛 Dados do Guincho
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="CNH Número"
                name="cnh_number"
                value={formData.cnh_number || ''}
                onChange={handleChange}
                required
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Categoria CNH</InputLabel>
                <Select
                  name="cnh_category"
                  value={formData.cnh_category || ''}
                  onChange={handleChange}
                  label="Categoria CNH"
                  required
                >
                  <MenuItem value="B">B</MenuItem>
                  <MenuItem value="C">C</MenuItem>
                  <MenuItem value="D">D</MenuItem>
                  <MenuItem value="E">E</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Placa do Veículo"
                name="license_plate"
                value={formData.license_plate || ''}
                onChange={handleChange}
                required
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Tipo de Guincho</InputLabel>
                <Select
                  name="tow_type"
                  value={formData.tow_type || ''}
                  onChange={handleChange}
                  label="Tipo de Guincho"
                >
                  <MenuItem value="platform">Plataforma</MenuItem>
                  <MenuItem value="hook">Gancho</MenuItem>
                  <MenuItem value="hydraulic">Hidráulico</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Capacidade de Carga (ton)"
                name="load_capacity"
                type="number"
                inputProps={{ step: "0.5" }}
                value={formData.load_capacity || ''}
                onChange={handleChange}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Raio de Atendimento (km)"
                name="service_radius"
                type="number"
                value={formData.service_radius || ''}
                onChange={handleChange}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Serviços Adicionais"
                name="additional_services"
                value={formData.additional_services || ''}
                onChange={handleChange}
                helperText="Ex: Troca de pneus, carga de bateria, socorro elétrico..."
              />
            </Grid>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <Box>
      <Grid container spacing={3}>
        {/* Dados Básicos */}
        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom>
            📋 Dados do Negócio
          </Typography>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="Nome do Negócio"
            name="business_name"
            value={formData.business_name || ''}
            onChange={handleChange}
            required
          />
        </Grid>
        
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="Nome do Responsável"
            name="user_name"
            value={formData.user_name || ''}
            onChange={handleChange}
            required
          />
        </Grid>
        
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="Email"
            name="user_email"
            type="email"
            value={formData.user_email || ''}
            onChange={handleChange}
            required
          />
        </Grid>
        
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="Telefone"
            name="phone"
            value={formData.phone || ''}
            onChange={handleChange}
            required
          />
        </Grid>
        
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="WhatsApp"
            name="whatsapp"
            value={formData.whatsapp || ''}
            onChange={handleChange}
          />
        </Grid>
        
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="Website"
            name="website"
            value={formData.website || ''}
            onChange={handleChange}
          />
        </Grid>

        {/* Endereço */}
        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom>
            📍 Endereço
          </Typography>
        </Grid>
        
        {baseFields}

        {/* Campos Específicos */}
        {typeSpecificFields()}

        {/* Documentos e Compliance */}
        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom>
            📄 Documentos e Compliance
          </Typography>
        </Grid>
        
        <Grid item xs={12}>
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              Para completar o cadastro, serão necessários os seguintes documentos:
            </Typography>
            <Box component="ul" sx={{ mt: 1, pl: 2 }}>
              {getRequiredDocuments().map((doc, index) => (
                <Typography component="li" key={index} variant="body2">
                  📸 {doc}
                </Typography>
              ))}
            </Box>
          </Alert>
        </Grid>
        
        <Grid item xs={12}>
          <Typography variant="subtitle2" gutterBottom>
            Upload de Documentos
          </Typography>
          
          {uploading && (
            <Box sx={{ mb: 2 }}>
              <LinearProgress />
              <Typography variant="caption" color="primary">
                Enviando documentos...
              </Typography>
            </Box>
          )}
          
          {uploadError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {uploadError}
            </Alert>
          )}
          
          <Grid container spacing={2}>
            {getRequiredDocuments().map((docType) => (
              <Grid item xs={12} sm={6} md={4} key={docType}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    {docType}
                  </Typography>
                  
                  <Button
                    variant="outlined"
                    component="label"
                    startIcon={<CloudUpload />}
                    fullWidth
                    sx={{ mb: 1 }}
                  >
                    Escolher Arquivo
                    <input
                      type="file"
                      hidden
                      accept="image/*,.pdf"
                      onChange={(e) => handleFileUpload(e, docType)}
                      disabled={uploading}
                    />
                  </Button>
                  
                  {/* Mostrar arquivos já enviados para este tipo */}
                  {uploadedFiles
                    .filter(file => file.type === docType)
                    .map((file, index) => (
                      <Box key={index} sx={{ mt: 1, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                        <Box display="flex" alignItems="center" justifyContent="space-between">
                          <Typography variant="caption" noWrap sx={{ flex: 1, mr: 1 }}>
                            {file.name}
                          </Typography>
                          <IconButton
                            size="small"
                            onClick={() => removeFile(uploadedFiles.indexOf(file))}
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        </Box>
                        <Box display="flex" alignItems="center" mt={0.5}>
                          {file.status === 'pending' ? (
                            <Chip size="small" label="Pendente" color="warning" />
                          ) : file.status === 'approved' ? (
                            <Chip size="small" label="Aprovado" color="success" icon={<CheckCircle fontSize="small" />} />
                          ) : (
                            <Chip size="small" label="Rejeitado" color="error" icon={<Error fontSize="small" />} />
                          )}
                        </Box>
                      </Box>
                    ))}
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Grid>
      </Grid>
    </Box>
  );
};

export default PartnerForm;
