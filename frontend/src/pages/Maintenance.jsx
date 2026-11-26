import { useEffect, useState } from 'react'
import api from '../services/api'
import { getApiErrorMessage } from '../utils/apiError'

function Maintenance() {
  const [records, setRecords] = useState([])
  const [equipment, setEquipment] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const [equipmentId, setEquipmentId] = useState('')
  const [maintenanceDate, setMaintenanceDate] = useState('')
  const [description, setDescription] = useState('')
  const [technician, setTechnician] = useState('')
  const [cost, setCost] = useState('')

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    async function fetchData() {
      try {
        const [maintenanceResponse, equipmentResponse] = await Promise.all([
          api.get('/maintenance'),
          api.get('/equipment'),
        ])

        setRecords(maintenanceResponse.data)
        setEquipment(equipmentResponse.data)
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
    setEquipmentId('')
    setMaintenanceDate('')
    setDescription('')
    setTechnician('')
    setCost('')
    setEditingId(null)
    setShowForm(false)
    setFormError('')
  }

  function handleEdit(item) {
    setEditingId(item.id)
    setEquipmentId(String(item.equipment_id))
    setMaintenanceDate(item.maintenance_date)
    setDescription(item.description)
    setTechnician(item.technician || '')
    setCost(item.cost ?? '')
    setFormError('')
    setShowForm(true)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')

    if (
      !equipmentId ||
      !maintenanceDate ||
      !description.trim()
    ) {
      setFormError('Lütfen zorunlu alanları doldurun.')
      return
    }

    setSaving(true)

    const data = {
      equipment_id: Number(equipmentId),
      maintenance_date: maintenanceDate,
      description: description.trim(),
      technician: technician.trim() || null,
      cost: cost === '' ? null : Number(cost),
    }

    try {
      if (editingId !== null) {
        const response = await api.put(
          `/maintenance/${editingId}`,
          data
        )

        setRecords((current) =>
          current.map((item) =>
            item.id === editingId ? response.data : item
          )
        )
      } else {
        const response = await api.post('/maintenance', data)
        setRecords((current) => [...current, response.data])
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
      'Bu bakım kaydını silmek istediğinize emin misiniz?'
    )

    if (!confirmed) return

    try {
      await api.delete(`/maintenance/${item.id}`)

      setRecords((current) =>
        current.filter((record) => record.id !== item.id)
      )
    } catch (err) {
      setError(
        getApiErrorMessage(err, 'Bakım kaydı silinirken bir hata oluştu.')
      )
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Bakım Takibi</h1>
          <p className="page-subtitle">
            Ekipman bakım kayıtlarını görüntüleyin ve yönetin.
          </p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Bakım Kayıtları</h2>

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
            disabled={equipment.length === 0}
          >
            {showForm ? 'İptal' : '+ Bakım Kaydı Ekle'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="laboratory-form">
            <h3>
              {editingId !== null
                ? 'Bakım Kaydını Düzenle'
                : 'Yeni Bakım Kaydı'}
            </h3>

            <label htmlFor="maintenance-equipment">Ekipman</label>
            <select
              id="maintenance-equipment"
              value={equipmentId}
              onChange={(event) => setEquipmentId(event.target.value)}
              required
            >
              <option value="">Ekipman seçin</option>
              {equipment.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} - {item.serial_number}
                </option>
              ))}
            </select>

            <label htmlFor="maintenance-date">Bakım Tarihi</label>
            <input
              id="maintenance-date"
              type="date"
              value={maintenanceDate}
              onChange={(event) => setMaintenanceDate(event.target.value)}
              required
            />

            <label htmlFor="maintenance-description">Açıklama</label>
            <textarea
              id="maintenance-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Yapılan bakım işlemlerini açıklayın."
              required
            />

            <label htmlFor="maintenance-technician">Teknisyen</label>
            <input
              id="maintenance-technician"
              type="text"
              value={technician}
              onChange={(event) => setTechnician(event.target.value)}
              placeholder="Teknisyen adı"
            />

            <label htmlFor="maintenance-cost">Maliyet</label>
            <input
              id="maintenance-cost"
              type="number"
              min="0"
              step="0.01"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
              placeholder="Örn. 250"
            />

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

        {loading && <p>Bakım kayıtları yükleniyor...</p>}

        {!loading && !error && equipment.length === 0 && (
          <p>Önce bir ekipman oluşturmalısınız.</p>
        )}

        {!loading && !error && equipment.length > 0 && records.length === 0 && (
          <p>Henüz kayıtlı bakım işleminiz bulunmuyor.</p>
        )}

        {!loading && records.length > 0 && (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>EKİPMAN</th>
                  <th>TARİH</th>
                  <th>AÇIKLAMA</th>
                  <th>TEKNİSYEN</th>
                  <th>MALİYET</th>
                  <th>İŞLEMLER</th>
                </tr>
              </thead>

              <tbody>
                {records.map((item) => {
                  const selectedEquipment = equipment.find(
                    (equipmentItem) =>
                      equipmentItem.id === item.equipment_id
                  )

                  return (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{selectedEquipment?.name || `Ekipman #${item.equipment_id}`}</td>
                      <td>{item.maintenance_date}</td>
                      <td>{item.description}</td>
                      <td>{item.technician || '-'}</td>
                      <td>
                        {item.cost !== null
                          ? `${Number(item.cost).toFixed(2)} TL`
                          : '-'}
                      </td>
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

export default Maintenance
