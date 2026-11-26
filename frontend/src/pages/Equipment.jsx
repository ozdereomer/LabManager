import { useEffect, useState } from 'react'
import api from '../services/api'
import { getApiErrorMessage } from '../utils/apiError'

const statusLabels = {
  available: 'Kullanılabilir',
  maintenance: 'Bakımda',
  broken: 'Arızalı',
}

function Equipment() {
  const [equipment, setEquipment] = useState([])
  const [laboratories, setLaboratories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [name, setName] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [status, setStatus] = useState('available')
  const [laboratoryId, setLaboratoryId] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    async function fetchData() {
      try {
        const [equipmentResponse, laboratoryResponse] = await Promise.all([
          api.get('/equipment'),
          api.get('/laboratories'),
        ])

        setEquipment(equipmentResponse.data)
        setLaboratories(laboratoryResponse.data)
      } catch (err) {
        setError(
          getApiErrorMessage(err, 'Veriler yüklenirken bir hata oluştu.')
        )
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  function resetForm() {
    setName('')
    setSerialNumber('')
    setStatus('available')
    setLaboratoryId('')
    setEditingId(null)
    setShowForm(false)
    setFormError('')
  }

  function handleEdit(item) {
    setEditingId(item.id)
    setName(item.name)
    setSerialNumber(item.serial_number)
    setStatus(item.status)
    setLaboratoryId(String(item.laboratory_id))
    setFormError('')
    setShowForm(true)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')

    if (!name.trim() || !serialNumber.trim() || !laboratoryId) {
      setFormError('Lütfen tüm alanları doldurun.')
      return
    }

    setSaving(true)

    const data = {
      name: name.trim(),
      serial_number: serialNumber.trim(),
      status,
      laboratory_id: Number(laboratoryId),
    }

    try {
      if (editingId !== null) {
        const response = await api.put(`/equipment/${editingId}`, data)

        setEquipment((current) =>
          current.map((item) =>
            item.id === editingId ? response.data : item
          )
        )
      } else {
        const response = await api.post('/equipment', data)

        setEquipment((current) => [...current, response.data])
      }

      resetForm()
    } catch (err) {
      setFormError(
        getApiErrorMessage(err, 'İşlem sırasında bir hata oluştu.')
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(item) {
    const confirmed = window.confirm(
      `"${item.name}" ekipmanını silmek istediğinize emin misiniz?`
    )

    if (!confirmed) return

    try {
      await api.delete(`/equipment/${item.id}`)

      setEquipment((current) =>
        current.filter((equipmentItem) => equipmentItem.id !== item.id)
      )
    } catch (err) {
      setError(
        getApiErrorMessage(err, 'Ekipman silinirken bir hata oluştu.')
      )
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Ekipmanlar</h1>
          <p className="page-subtitle">
            Laboratuvar ekipmanlarını görüntüleyin ve yönetin.
          </p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Tüm Ekipmanlar</h2>

          <button
            className="add-button"
            onClick={() => {
              if (showForm) {
                resetForm()
              } else {
                setShowForm(true)
                setFormError('')
              }
            }}
            disabled={laboratories.length === 0}
          >
            {showForm ? 'İptal' : '+ Ekipman Ekle'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="laboratory-form">
            <h3>
              {editingId !== null ? 'Ekipmanı Düzenle' : 'Yeni Ekipman'}
            </h3>

            <label htmlFor="equipment-name">Ekipman Adı</label>
            <input
              id="equipment-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Örn. 3D Yazıcı"
              required
            />

            <label htmlFor="serial-number">Seri Numarası</label>
            <input
              id="serial-number"
              type="text"
              value={serialNumber}
              onChange={(event) => setSerialNumber(event.target.value)}
              placeholder="Örn. PRN-2026-001"
              required
            />

            <label htmlFor="equipment-status">Durum</label>
            <select
              id="equipment-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="available">Kullanılabilir</option>
              <option value="maintenance">Bakımda</option>
              <option value="broken">Arızalı</option>
            </select>

            <label htmlFor="laboratory">Bağlı Laboratuvar</label>
            <select
              id="laboratory"
              value={laboratoryId}
              onChange={(event) => setLaboratoryId(event.target.value)}
              required
            >
              <option value="">Laboratuvar seçin</option>

              {laboratories.map((lab) => (
                <option key={lab.id} value={lab.id}>
                  {lab.name}
                </option>
              ))}
            </select>

            {formError && (
              <p className="auth-error">{formError}</p>
            )}

            <button
              type="submit"
              className="add-button"
              disabled={saving}
            >
              {saving
                ? 'Kaydediliyor...'
                : editingId !== null
                  ? 'Değişiklikleri Kaydet'
                  : 'Kaydet'}
            </button>
          </form>
        )}

        {error && <p className="auth-error">{error}</p>}

        {loading && <p>Ekipmanlar yükleniyor...</p>}

        {!loading && !error && laboratories.length === 0 && (
          <p>Önce bir laboratuvar oluşturmalısınız.</p>
        )}

        {!loading && !error && laboratories.length > 0 && equipment.length === 0 && (
          <p>Henüz kayıtlı ekipmanınız bulunmuyor.</p>
        )}

        {!loading && equipment.length > 0 && (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>EKİPMAN ADI</th>
                  <th>SERİ NUMARASI</th>
                  <th>DURUM</th>
                  <th>LABORATUVAR</th>
                  <th>İŞLEMLER</th>
                </tr>
              </thead>

              <tbody>
                {equipment.map((item) => {
                  const laboratory = laboratories.find(
                    (lab) => lab.id === item.laboratory_id
                  )

                  return (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.name}</td>
                      <td>{item.serial_number}</td>
                      <td>{statusLabels[item.status] || item.status}</td>
                      <td>{laboratory?.name || 'Bilinmiyor'}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => handleEdit(item)}
                        >
                          Düzenle
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                        >
                          Sil
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

export default Equipment
